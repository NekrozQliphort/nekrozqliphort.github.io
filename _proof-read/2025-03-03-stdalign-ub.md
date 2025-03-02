---
title: "Learner's Notes: std::align - My Unexpected Contribution to cppreference"
date: 2025-03-03 00:08:00 +0800
categories: [Learner's Notes, C++]
tags: [learners-notes, cs, c++]
# comments: true    # TAG names should always be lowercase
---

# The Start of the Mystery
The other day, I was digging into `std::align` and came across this [code example](https://en.cppreference.com/mwiki/index.php?title=cpp/memory/align&oldid=153144) on cppreference. Here it is for reference:
```c++
#include <iostream>
#include <memory>
 
template<std::size_t N>
struct MyAllocator
{
    char data[N];
    void* p;
    std::size_t sz;
    MyAllocator() : p(data), sz(N) {}
    template<typename T>
    T* aligned_alloc(std::size_t a = alignof(T))
    {
        if (std::align(a, sizeof(T), p, sz))
        {
            T* result = reinterpret_cast<T*>(p);
            p = (char*)p + sizeof(T);
            sz -= sizeof(T);
            return result;
        }
        return nullptr;
    }
};
 
int main()
{
    MyAllocator<64> a;
    std::cout << "allocated a.data at " << (void*)a.data
              << " (" << sizeof a.data << " bytes)\n";
 
    // allocate a char
    if (char* p = a.aligned_alloc<char>())
    {
        *p = 'a';
        std::cout << "allocated a char at " << (void*)p << '\n';
    }
 
    // allocate an int
    if (int* p = a.aligned_alloc<int>())
    {
        *p = 1;
        std::cout << "allocated an int at " << (void*)p << '\n';
    }
 
    // allocate an int, aligned at 32-byte boundary
    if (int* p = a.aligned_alloc<int>(32))
    {
        *p = 2;
        std::cout << "allocated an int at " << (void*)p << " (32 byte alignment)\n";
    }
}
```
While looking at this, something felt off. Is this actually well-defined behavior?

Specifically, there's a `reinterpret_cast<int*>(p)` happening on a pointer that originally pointed to a `char` object, then a write to it after through this pointer. Seems reasonable at first glance, but does the C++ standard actually allow this?

This was a fun rabbit hole to go down, and the fix ended up being a bit unexpected. Let's get into it.

# Accessing Values Is Complicated
First things first, does accessing the value after `reinterpret_cast<int*>` even make sense? Let's break it down.  

Shoutout to [Seha](https://en.cppreference.com/w/Talk:Main_Page/suggestions#std::align_example_might_have_UB), who was the first to point out a potential issue with this code and also quoted the relevant part of the standard.  

Now, according to section 7.2.1.11 of the [C++23 standard](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2023/n4950.pdf), we have this rule:  
> If a program attempts to access the stored value of an object through a glvalue whose type is **not similar** to one of the following types the behavior is **undefined**:  
> - **the dynamic type of the object**,  
> - a type that is the signed or unsigned type corresponding to the dynamic type of the object, or  
> - a `char`, `unsigned char`, or `std::byte` type.  

So, applying this to our case, the only way this wouldn't be undefined behavior is if `int` is similar to the dynamic type of the object, which is `char`.  

Now, the formal definition of similar types in the standard is pretty complicated (even I had trouble with it), but cppreference gives a nice summary in [this section](https://en.cppreference.com/w/cpp/language/implicit_conversion#Similar_types):  
> Informally, two types are similar if, ignoring top-level cv-qualification:
> - they are the same type; or
> - they are both pointers, and the pointed-to types are similar; or
> - they are both pointers to member of the same class, and the types of the pointed-to members are similar; or
> - they are both arrays and the array element types are similar.

Looking at this, it's pretty clear that `int` and `char` are not similar types.  

So, does that mean case closed? Is this definitely undefined behavior?  

# Implicitly Creating Objects
Well, there’s actually another way this could be well-defined, that is if, somehow, the dynamic type of the object is actually `int`. But how would that even work? We never used placement `new`, so there shouldn’t be an `int` object there, right?  

Let’s take a look at what it takes to create an object, according to sections 6.7.2.1 and 6.7.2.10 of the [C++23 standard](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2023/n4950.pdf): 

> The constructs in a C++ program create, destroy, refer to, access, and manipulate objects. An object is created by a **definition**, by a **new-expression**, by an operation that **implicitly creates objects** (see below), when implicitly **changing the active member of a union**, or **when a temporary object is created**. An object occupies a region of storage in its period of construction, throughout its lifetime, and in its period of destruction.

> Some operations are described as implicitly creating objects within a specified region of storage. For each operation that is specified as implicitly creating objects, that operation **implicitly creates** and starts the lifetime of zero or more objects of **implicit-lifetime types** in its specified region of storage if doing so **would result in the program having defined behavior**. If no such set of objects would give the program defined behavior, the behavior of the program is undefined. If multiple such sets of objects would give the program defined behavior, it is unspecified which such set of objects is created.

That’s a lot of words, but the key part is this: even though there’s no explicit `int` object created, one could be implicitly created under the right conditions.  
So, to really figure out whether this is **undefined behavior**, we need to answer two questions:  
- Is `int` an implicit-lifetime type? 
- Is there an operation here that implicitly creates an `int` object?
If both are true, then our `reinterpret_cast<int*>` might actually be fine. Otherwise, we’re back in UB territory.

# Implicit-Lifetime Types
Let's try to break down what implicit-lifetime types actually are. According to section 6.8.1.9 of the [C++23 standard](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2023/n4950.pdf):  

> Scalar types, implicit-lifetime class types, array types, and cv-qualified versions of these types are collectively called implicit-lifetime types.

So what exactly are implicit-lifetime class types? They're either:  
- An aggregate whose destructor is not user-provided, or  
- A class that has at least one trivial eligible constructor and a trivial, non-deleted destructor.  

This is a handy bit of information for future reference, but for our case, we don’t really need to worry about this. We can already see that `int` qualifies as an implicit-lifetime type because it’s a scalar type.  

With that settled, we move on to the second (and more interesting) question: Is there an operation in the original implementation that implicitly creates an `int` object?

# Looking At CWG 2489
Originally, the C++ standard had this rule:  
> An operation that begins the lifetime of an array of `char`, `unsigned char`, or `std::byte` implicitly creates objects within the region of storage occupied by the array.  

However, this changed with the acceptance of **CWG2489**. Now, as per section 6.7.2.13, the wording is:  
> An operation that begins the lifetime of an array of `unsigned char` or `std::byte` implicitly creates objects within the region of storage occupied by the array.  

In simpler terms:  
An operation that begins the lifetime of an array of `unsigned char` or `std::byte` such as a definition of the array would have implicitly created the `int` object within the region of storage occupied by the array, but this no longer applies to `char` arrays.

This is unfortunate for our case. Since the original implementation used an array of `char`, this is undefined behavior. (There are other ways an object could be implicitly created, but none of them apply here.) 

# Suggestion and Final Changes
With all that said, my suggested fix can be found [here](https://en.cppreference.com/w/Talk:Main_Page/suggestions#std::align_example_UB_Follow_Up). I might have overcomplicated things a little, but ultimately, the array of `char` was replaced with `std::byte` and the example is now clearly indicates it only works for implicit-lifetime types.

```cpp
template<std::size_t N>
struct MyAllocator
{
    std::byte data[N];
    void* p;
    std::size_t sz;
    MyAllocator() : p(data), sz(N) {}

    // Note: Only well-defined for implicit-lifetime types
    template<typename T>
    T* implicit_aligned_alloc(std::size_t a = alignof(T))
    {
        if (std::align(a, sizeof(T), p, sz))
        {
            T* result = reinterpret_cast<T*>(p);
            p = static_cast<std::byte*>(p) + sizeof(T);
            sz -= sizeof(T);
            return result;
        }
        return nullptr;
    }
};
```

And with that, my first (and probably last, since I’m no expert) contribution to cppreference comes to a close! Hopefully, you found this little adventure interesting. Also, a big shoutout to r/cpp_questions, which helped me dig into this issue as well.

Till next time!

# References
1. [Working Draft, Standard for Programming Language C++ (C++23)](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2023/n4950.pdf)
2. [CWG2489. Storage provided by array of char](https://cplusplus.github.io/CWG/issues/2489.html)
3. [cppreference](https://en.cppreference.com/)