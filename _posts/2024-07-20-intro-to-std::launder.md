---
title: "Learner's Notes - Introduction to std::launder"
date: 2024-07-20 18:10:00 +0800
categories: [Learner's Notes, C++]
tags: [learners-notes, cs, c++]
comments: true    # TAG names should always be lowercase
---

# Introduction
Lets start with what `std::launder` is. According to [cppreference](https://en.cppreference.com/w/cpp/utility/launder), it has the folllowing function definition:

```c++
template <class T>
constexpr T* launder( T* p ) noexcept;
```

OK, so it takes a pointer to type `T` and returns a pointer to type `T`, but what does it do specifically? The informal definition given is the following:

> Provenance fence with respect to `p`. Returns a pointer to the same memory that `p` points to, but where the referent object is assumed to have a distinct lifetime and dynamic type.

So it takes in a pointer `p` and returns it? Isn't that just a no-op? Thus begins our journey to understand the mysterious `std::launder`.

# Placement _New_
Before we begin, it would be useful to know a little bit about placement `new`. All that is needed to know is that it is used to construct objects in pre-allocated storage. We can see an example given by [cppreference](https://en.cppreference.com/w/cpp/language/new#Placement_new)

```c++
// within any block scope...
{
    // Statically allocate the storage with automatic storage duration
    // which is large enough for any object of type “T”.
    alignas(T) unsigned char buf[sizeof(T)];
 
    T* tptr = new(buf) T; // Construct a “T” object, placing it directly into your 
                          // pre-allocated storage at memory address “buf”.
 
    tptr->~T();           // You must **manually** call the object's destructor
                          // if its side effects is depended by the program.
}                         // Leaving this block scope automatically deallocates “buf”.
```

# Initial Problem with _std::optional_
In section 6.8.8.3 of the [C++17 standard](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2017/n4659.pdf), note the following:
> If, after the lifetime of an object has ended and before the storage which the object occupied is reused or released, **a new object is created at the storage location which the original object occupied**, a pointer that pointed to the original object, a reference that referred to the original object, or the name of **the original object will automatically refer to the new object** and, once the lifetime of the new object has started, can be used to manipulate the new object, **if**:  
\[...\]  
the type of the original object is not const-qualified, and, if a class type, **does not contain
any non-static data member whose type is const-qualified or a reference type**  
\[...\]

Let's take a look at the simplified code of original problem brought up [here](https://groups.google.com/a/isocpp.org/g/std-proposals/c/93ebFsxCjvQ/m/myxPG6o_9pkJ):
```c++
#include <iostream>
#include <utility>

template <class T>
union U {
    constexpr U(T &&x) : value_(std::forward<T>(x)) {}
    unsigned char dummy_;
    T value_;
};

template <class T>
struct optional {
    constexpr optional(T &&x) : storage_(std::forward<T>(x)) {}
    template <class... Params>
    void emplace(Params &&...params) {
        storage_.value_.~T();
        new (&storage_.value_) T(std::forward<Params>(params)...);
    }
    constexpr T &operator*() & noexcept { return storage_.value_; }
    U<T> storage_;
};

struct A {
    constexpr A(int &x) : ref(x) {}
    int &ref;
};

int main() {
    int n1{0}, n2{0};
    optional<A> opt2{A{n1}};
    opt2.emplace(n2);
    (*opt2).ref = 1;
    std::cout << n1 << " " << n2 << std::endl;
}
```

So, what's the crux of the issue? Look at line 19, specifically `return storage_.value_;`. Note that struct `A` contains an `int&` member. From the standard mentioned above, this means the original object will no longer automatically refer to the new object, leading to undefined behavior on line 32.

# std::launder
`std::launder` is designed to overcome this issue (among other issues that we'll discuss later). By using `std::launder`, we can avoid undefined behavior by modifying line 19 to `constexpr T &operator*() & noexcept { return *std::launder(&storage_.value_); }`.

Formally, `std::launder` does the following:
> Given:
> - the pointer `p` represents the address `A` of a byte in memory
> - an object `x` is located at the address `A`
> - `x` is within its lifetime
> - the type of `x` is the same as `T`, ignoring cv-qualifiers at every level
> - every byte that would be reachable through the result is reachable through `p` (bytes are reachable through a pointer that points to an object `y` if those bytes are within the storage of an object `z` that is pointer-interconvertible with `y`, or within the immediately enclosing array of which `z` is an element).  
>
> Then `std::launder(p)` returns a value of type `T*` that points to the object `x`. Otherwise, the behavior is undefined.

Simply put, `std::launder` ensures that the resulting pointer will point to the newly created object, thereby eliminating undefined behavior.

# C++20 Changes
With [C++20](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2020/n4861.pdf), there are some notable changes, including the conditions under which the name of the original object automatically refers to the new object:
> If, after the lifetime of an object has ended and before the storage which the object occupied is reused or released, **a new object is created at the storage location which the original object occupied**, a pointer that pointed to the original object, a reference that referred to the original object, or the name of **the original object will automatically refer to the new object** and, once the lifetime of the new object has started, can be used to manipulate the new object, **if the original object is transparently replaceable** (see below) by the new object.

The concept of transparently replaceable has evolved:
> An object `x` is transparently replaceable by an object `y` if:
- the storage that `y` occupies exactly overlays the storage that `x` occupied, and
- `x` and `y` are of the same type (ignoring the top-level cv-qualifiers), and
- `x` is not a complete const object, and
- neither `x` nor `y` is a potentially-overlapping subobject, and
- either `x` and `y` are both complete objects, or `x` and `y` are direct subobjects of objects `ox` and `oy`, respectively, and `ox` is transparently replaceable by `oy`.

Notably, it **no longer requires** that a class type must **not have non-static data members whose type is const-qualified or a reference type**. This means that, even without `std::launder`, there are no issues with the previously given example.

So, is `std::launder` just a relic of the past?

# Another _std::launder_ issue
Even though the notion of transparently replaceable has evolved, there are still limitations, one of them being:
> An object `x` is transparently replaceable by an object `y` if:  
- \[...\] 
- `x` and `y` are of the **same type** (ignoring the top-level cv-qualifiers), and  
- \[...\]

Here is a simple example:
```c++
#include <cstddef>
#include <iostream>
#include <new>

struct T {
    int val;
    T(int val): val{val} {}
};

int main() {
    alignas(T) std::byte data[sizeof(T)];
    new (data) T{1};
    T* p = reinterpret_cast<T*>(data);
    std::cout << p->val << std::endl; // UB
}
```
Since `data` does not directly point to an object of type `T`, there is no guarantee that `p` will point to the newly created object, leading to undefined behavior on line 14. There are two ways to solve this issue:

1. **Use the pointer returned from placement `new`:**  
Simply changing line 12 and 13 to `T* p = new (data) T{1};` would solve the issue. However, this may not always be a viable solution due to the overhead of storing the pointer returned by placement `new`.
2. **Use `std::launder`:**  
Changing line 13 to `T* p = std::launder(reinterpret_cast<T*>(data));` also avoids undefined behavior, ensuring that `p` correctly points to the newly created object within data, avoiding any undefined behavior.

# Conclusion
> Don’t ask. If you’re not one of the 5 or so people in the world who already know what this is, you don’t want or need to know.

These are the wise words of Botond Ballo, and I have to agree with him. However, I do hope this post provides some insights into what `std::launder` is and what it tries to solve.

Till next time!

# References
1. [On launder()](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2017/p0532r0.pdf)
2. [Implementability of std::optional](https://groups.google.com/a/isocpp.org/g/std-proposals/c/93ebFsxCjvQ/m/myxPG6o_9pkJ)
3. [cppreference - Lifetime](https://en.cppreference.com/w/cpp/language/lifetime)
4. [Working Draft, Standard for Programming Language C++ (C++17)](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2017/n4659.pdf)
5. [Working Draft, Standard for Programming Language C++ (C++20)](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2020/n4861.pdf)
6. [std::launder: the most obscure new feature of C++17](https://miyuki.github.io/2016/10/21/std-launder.html)
7. [What is the purpose of std::launder?](https://stackoverflow.com/questions/39382501/what-is-the-purpose-of-stdlaunder)
8. [std::launder use cases in C++20](https://stackoverflow.com/questions/62114622/stdlaunder-use-cases-in-c20)
9. [Placement new + reinterpret_cast in C++14: well-formed?](https://stackoverflow.com/questions/77388853/placement-new-reinterpret-cast-in-c14-well-formed)


‌





