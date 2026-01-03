---
title: "Learner's Notes: Alignment and padding - What does [[no_unique_address]] do?"
date: 2026-01-03 00:00:00 +0800
categories: [Learner's Notes, C++]
tags: [learners-notes, cs, c++]
math: true
---

# Problem Statement
Let’s start with a small, innocent-looking example:
```cpp
struct Foo {
    long long foo_val;
    bool      foo_val2;
};

template <typename T>
struct MaybeDeleted {
    T    val;
    bool deleted;
};

static_assert(sizeof(Foo) == 16);
static_assert(alignof(Foo) == 8);
static_assert(sizeof(MaybeDeleted<Foo>) == 24);
```
At first glance, nothing here looks particularly suspicious. `Foo` contains a `long long` and a `bool`, and `MaybeDeleted<T>` simply wraps some `T` together with a `bool` flag that tells us whether the object has been logically deleted. This pattern shows up all the time in lazy-deletion data structures or "tombstone"-style designs where an element might still physically exist but is considered dead from a logical point of view.

But there’s an obvious problem lurking in the layout. `deleted` ends up costing us another 8 bytes (i.e. `alignof(Foo)`) worth of space. Even though `Foo` already has padding bytes, we're not reusing them. Conceptually, this feels wasteful. `Foo` already has unused padding bytes, and in theory, we could squeeze `deleted` into that space without violating any alignment requirements. 

So the question becomes:
Can we reuse padding bytes in a standards-compliant way, while still respecting alignment? (i.e. we want to avoid `#pragma pack(1)`)

Let’s take a look at what the language actually gives us to work with.

# Potentially-overlapping subobjects and [[no_unique_address]]
Before we get too excited, let’s slow down and make sure we agree on the vocabulary. First up: subobjects. From [\[intro.object\]/2](https://timsong-cpp.github.io/cppwp/n4950/intro.object#2):
> Objects can contain other objects, called subobjects. A subobject can be a member subobject, a base class subobject, or an array element.

Nothing controversial here. In our case, both `val` and `deleted` inside `MaybeDeleted<T>` are member subobjects. Now, what do we want exactly?

We want the `deleted` member subobject to overlap with `T`, ideally living inside `T`'s padding bytes. In other words, we’re hoping the compiler will tuck `deleted` into space that would otherwise be wasted, without breaking alignment rules or invoking any undefined behavior. Thankfully, the standard gives us a very relevant concept here: potentially-overlapping subobjects. From [\[intro.object\]/7](https://timsong-cpp.github.io/cppwp/n4950/intro.object#7):

> A potentially-overlapping subobject is either:
- a base class subobject, or
- **a non-static data member declared with the no_unique_address attribute.**

So we have `[[no_unique_address]]`. Promising. Let’s check what it actually buys us in practice. From [cppreference](https://en.cppreference.com/w/cpp/language/attributes/no_unique_address):
> Applies to the name being declared in the declaration of a non-static data member that is not a bit-field.<br>
Makes this member subobject potentially-overlapping, i.e., allows this member to be overlapped with other non-static data members or base class subobjects of its class. This means that if the member has an empty class type (e.g. stateless allocator), the compiler may optimize it to occupy no space, just like if it were an empty base. **If the member is not empty, any tail padding in it may be also reused to store other data members.** 

That last sentence is exactly what we’re after. So, in theory, we just slap `[[no_unique_address]]` onto `T` and call it a day, right? Let’s try it:
```cpp
struct Foo {
    long long foo_val;
    bool      foo_val2;
};

template <typename T>
struct MaybeDeleted {
    [[no_unique_address]] T val;
    bool deleted;
};

static_assert(sizeof(Foo) == 16);
static_assert(alignof(Foo) == 8);
static_assert(sizeof(MaybeDeleted<Foo>) == 16);
```
...Wait, what? The static assertion `sizeof(MaybeDeleted<Foo>) == 16` fails? And then it hits:
> **may** be also reused to store other data members.

OK, I mean it's in the name: **potentially-overlapping** subobject, emphasis on potentially-overlapping. Well then. Guess that’s it. Problem unsolved. Blog over. See you next time.

...or maybe not quite.

# What does the C++23 standard give us?
Interestingly, there are very few hard guarantees that the C++ standard gives us here. Let's take a look at a few relevant quotes, found in [\[intro.object\]/8](https://timsong-cpp.github.io/cppwp/n4950/intro.object#8) and [\[intro.object\]/9](https://timsong-cpp.github.io/cppwp/n4950/intro.object#9):
> An object has nonzero size if it
- is not a potentially-overlapping subobject, or
- is not of class type, or
- is of a class type with virtual member functions or virtual base classes, or
- has subobjects of nonzero size or unnamed bit-fields of nonzero length.
Otherwise, if the object is a base class subobject of a standard-layout class type with no non-static data members, it has zero size. Otherwise, the circumstances under which the object has zero size are implementation-defined.

And then:
> Unless an object is a bit-field or a subobject of zero size, the address of that object is the address of the first byte it occupies. Two objects with overlapping lifetimes that are not bit-fields may have the same address if one is nested within the other, or if at least one is a subobject of zero size and they are of different types; otherwise, they have distinct addresses and occupy disjoint bytes of storage.

These two paragraphs aren't directly relevant to our main problem, but for completeness' sake, let’s illustrate the second rule with a small example:
```cpp
struct Foo {};

struct Bar {
    char c;
    [[no_unique_address]] Foo foo;
};

struct Bar2 {
    Foo foo;
    [[no_unique_address]] Foo foo2;
};

static_assert(sizeof(Bar) == 1);
static_assert(sizeof(Bar2) == 2);
```
In `Bar`, the empty `Foo` subobject can overlap with `c`, so the total size is just 1 byte. In `Bar2`, however, things are different. Even though `foo2` is marked `[[no_unique_address]]`, it cannot overlap with `foo`. The reason is spelled out quite explicitly in the standard text above: since `foo` and `foo2` are of the same type, they must have distinct addresses and occupy disjoint bytes of storage.

This detail isn’t relevant to our current discussion however, as we don't have any zero-size subobjects, but it's a useful constraint to keep in mind when reasoning about empty classes and object layout in general. So where does the tail-padding reuse mentioned on cppreference actually come from?

The key wording lives in [\[dcl.attr.nouniqueaddr\]/2](https://timsong-cpp.github.io/cppwp/n4950/dcl.attr.nouniqueaddr#2):
> The non-static data member can share the address of another non-static data member or that of a base class, and **any padding that would normally be inserted at the end of the object can be reused as storage for other members**.

This is reassuring, as it clearly states what implementations are allowed to do. At first glance, however, this seems to contradict what we saw earlier:
> **Two objects with overlapping lifetimes** that are not bit-fields may have the same address if one is nested within the other, or if at least one is a subobject of zero size and they are of different types; otherwise, they **have distinct addresses and occupy disjoint bytes of storage**.

Since our case does not satisfy the preconditions, they must occupy disjoint bytes of storage. But if `val` occupies `sizeof(T)` and `deleted` occupies `sizeof(bool)`, how can they possibly overlap? The missing piece is a less obvious rule, buried in [footnote 61 of \[expr.sizeof\]](https://timsong-cpp.github.io/cppwp/n4950/expr.sizeof#footnote-61):
>  The **actual size of a potentially-overlapping subobject can be less than the result of applying `sizeof` to the subobject**, due to virtual base classes and less strict padding requirements on potentially-overlapping subobjects.

In other words, while `sizeof(T)` is fixed, the amount of storage actually assigned to a potentially-overlapping subobject of type `T` is not. Once that distinction is made, the apparent contradiction disappears. 

Unfortunately, the standard still does not mandate when or how this space reduction must occur. All of it remains optional and implementation-defined. So if you were hoping for a clean, fully standard-mandated solution here... unfortunately, this is where the trail goes cold.

# What does the Itanium C++ ABI give us?
Before going further, it’s worth taking a step back and asking: what exactly is an Application Binary Interface (ABI)? I think a good starting point is the following excerpts from [GCC's ABI Policy and Guidelines Document](https://gcc.gnu.org/onlinedocs/gcc-8.5.0/libstdc++/manual/manual/abi.html) and [Itanium C++ ABI's Specification Document](https://itanium-cxx-abi.github.io/cxx-abi/abi.html).
> C++ source that is compiled into object files is transformed by the compiler: it arranges objects with specific alignment and in a particular layout, mangling names according to a well-defined algorithm, has specific arrangements for the support of virtual functions, etc. These details are defined as the compiler Application Binary Interface, or ABI.

> In this document, we specify the Application Binary Interface (ABI) for C++ programs: that is, the object code interfaces between different user-provided C++ program fragments and between those fragments and the implementation-provided runtime and libraries. This includes the memory layout for C++ data objects, including both predefined and user-defined data types, as well as internal compiler generated objects such as virtual tables. It also includes function calling interfaces, exception handling interfaces, global naming, and various object code conventions. 

Simply put, an ABI specifies how compiled machine code represents data, symbols, and interfaces so that separately compiled pieces of code can interoperate correctly. We are specifically interested in the Itanium C++ ABI because, since GCC version 3, the GNU C++ compiler has followed this industry-standard C++ ABI. As it explicitly specifies rules for the memory layout of C++ data objects, it gives us a concrete model for how GCC handles potentially-overlapping subobjects in practice.

# POD and POD for the purpose of layout
Before diving into the layout rules themselves, it’s important to clarify some terminology used by the Itanium C++ ABI. In particular, it distinguishes between two related but different concepts: "POD" and "POD for the purpose of layout".

Let’s start with POD:
> There have been multiple published revisions to the ISO C++ standard, and each one has included a different definition of POD. To ensure interoperation of code compiled according to different revisions of the standard, it is necessary to settle on a single definition for a platform. **A platform vendor may choose to follow a different revision of the standard, but by default, the definition of POD under this ABI is the definition from the 2003 revision (TC1)**. 

The 2003 definition is surprisingly hard to track down directly, but a [Stack Overflow answer](https://stackoverflow.com/a/4178176) provided us with the definition:
> A POD-struct is an aggregate class that has no **non-static data members of type non-POD-struct, non-POD-union (or array of such types) or reference**, and **has no user-defined copy assignment operator** and **no user-defined destructor**. Similarly, a POD-union is an aggregate union that has no non-static data members of type non-POD-struct, non-POD-union (or array of such types) or reference, and has no user-defined copy assignment operator and no user-defined destructor. A POD class is a class that is either a POD-struct or a POD-union.

> An aggregate is an array or a **class** (clause 9) with **no user-declared constructors** (12.1), **no private or protected non-static data members** (clause 11), **no base classes** (clause 10), and **no virtual functions** (10.3).

The term "user-defined" is unfortunately ambiguous here, especially in post-C++11 terminology. This ambiguity is discussed [here](https://github.com/itanium-cxx-abi/cxx-abi/issues/66):
> But "user-defined" is meaningless in C++11 onwards. It looks like Clang interprets it as meaning "user-declared", which makes Base non-POD, and GCC interprets it as meaning "user-provided", which makes Base POD.

For the purposes of this blog, and since we are focusing on GCC, we'll adopt GCC’s interpretation and treat "user-defined" as meaning user-provided, which has a precise definition in [\[dcl.attr.nouniqueaddr\]/2](https://timsong-cpp.github.io/cppwp/n4950/dcl.fct.def.default#5):
> A function is user-provided if it is user-declared and not explicitly defaulted or deleted on its first declaration.

With that out of the way, what does "POD for the purpose of layout" mean? The Itanium C++ ABI defines it as follows:
> In general, a type is considered a POD for the purposes of layout if it is a POD type (in the sense of ISO C++ [basic.types]). However, a type is **not** considered to be a POD for the purpose of layout if it is:
- a POD-struct or POD-union (in the sense of ISO C++ [class]) with a bit-field whose declared width is wider than the declared type of the bit-field, or
- an array type whose element type is not a POD for the purpose of layout, or
- **a POD-struct with one or more potentially-overlapping non-static data members.**
Where references to the ISO C++ are made in this paragraph, the Technical Corrigendum 1 version of the standard is intended. 

The key takeaway is that only `Foo` remains a POD for the purpose of layout (i.e. `MaybeDeleted<Foo>` does not). Once `[[no_unique_address]]` introduces potentially-overlapping non-static data members, `MaybeDeleted<Foo>` is explicitly excluded from that category. However, something to note is that whether `MaybeDeleted<Foo>` is a POD is [a point of contention](https://github.com/llvm/llvm-project/issues/50766#issuecomment-3504907751) as it's underspecified in the Itanium C++ ABI, resulting in different behaviours between GCC and Clang (GCC considers any class type with one or more potentially-overlapping non-static data members to be non-POD).

These definitions will come up again later in the blog, so it’s worth keeping them firmly in mind.

# Memory Layout Rules
Let’s take a look at this example again:
```cpp
struct Foo {
    long long foo_val;
    bool      foo_val2;
};

template <typename T>
struct MaybeDeleted {
    [[no_unique_address]] T val;
    bool deleted;
};
```
Before we start, let's make sure we agree on the terminology used by the Itanium C++ ABI. From the [General Section](https://itanium-cxx-abi.github.io/cxx-abi/abi.html#general):
> In what follows, we define the memory layout for C++ data objects. Specifically, for each type, we specify the following information about an object O of that type:
- **the size of an object, sizeof(O)**;
- **the alignment of an object, align(O)**; and
- **the offset within O, offset(C), of each data component C**, i.e. base or member.
>
> For purposes internal to the specification, we also specify:
- **dsize(O): the data size of an object, which is the size of O without tail padding** .
- **nvsize(O): the non-virtual size of an object, which is the size of O without virtual bases**.
- **nvalign(O): the non-virtual alignment of an object, which is the alignment of O without virtual bases**. 

Since `Foo` is a POD for the purpose of layout, we follow both: [section 2.2 POD Data Types in Itanium C++ ABI](https://itanium-cxx-abi.github.io/cxx-abi/abi.html#pod) and the base C ABI, in this case, [section 3.1.2 Data Representation in System V Application Binary Interface](https://gitlab.com/x86-psABIs/x86-64-ABI/-/jobs/artifacts/master/raw/x86-64-ABI/abi.pdf?job=build). From the System V ABI (Aggregates and Unions):
> Structures and unions **assume the alignment of their most strictly aligned component**. Each member is assigned to the **lowest available offset with the appropriate alignment**. The **size of any object is always a multiple of the object's alignment**.

From the Itanium C++ ABI POD rules:
> The **dsize, nvsize, and nvalign of these types are defined to be their ordinary size and alignment**. These properties only matter for non-empty class types that are used as base classes. We **ignore tail padding for PODs** because the standard before the resolution of CWG issue 43 did not allow us to use it for anything else and because it sometimes permits faster copying of the type.

Hence, for `Foo` in the example, the following would be true:

|   Field    | Value |
| :--------- | :---- |
|   sizeof   |   16  |
|   dsize    |   16  |
|   align    |   8   |
|   nvsize   |   16  |
|   nvalign  |   8   |  

However, since `MaybeDeleted<Foo>` is a not a POD for the purpose of layout, we will follow the rules of [section 2.4 Non-POD Class Types in Itanium C++ ABI](https://itanium-cxx-abi.github.io/cxx-abi/abi.html#class-types). For simplicity, I've quoted the relevant rules we will use below:
> For a class type C which is not a POD for the purpose of layout, assume that all component types (i.e. proper base classes and non-static data member types) have been laid out, defining size, data size, non-virtual size, alignment, and non-virtual alignment. (See the description of these terms in General above.) Layout (of type C) is done using the following procedure.  
I. Initialization
1. **Initialize sizeof(C) to zero, align(C) to one, dsize(C) to zero**.  
...
>
> II. Allocation of Members Other Than Virtual Bases  
For each data component D (first the primary base of C, if any, then the non-primary, non-virtual direct base classes in declaration order, then the non-static data members and unnamed bit-fields in declaration order), allocate as follows:
1. ...
2. If **D is not an empty base class and D is not an empty data member**:
- **Start at offset dsize(C), incremented if necessary for alignment to nvalign(D) for base classes or to align(D) for data members**. Place D at this offset unless doing so would result in two components (direct or indirect) of the same type having the same offset. If such a component type conflict occurs, increment the candidate offset by nvalign(D) for base classes or by align(D) for data members and try again, repeating until success occurs (which will occur no later than sizeof(C) rounded up to the required alignment).
- If D is a base class, this step allocates only its non-virtual part, i.e. excluding any direct or indirect virtual bases.
- If D is a base class, update sizeof(C) to max (sizeof(C), offset(D)+nvsize(D)). Otherwise, if **D is a potentially-overlapping data member, update sizeof(C) to max (sizeof(C), offset(D)+max (nvsize(D), dsize(D)))**. Otherwise, **if D is a data member, update sizeof(C) to max (sizeof(C), offset(D)+sizeof(D))**.
- If D is a base class (not empty in this case), update dsize(C) to offset(D)+nvsize(D), and align(C) to max (align(C), nvalign(D)). If **D is a potentially-overlapping data member, update dsize(C) to offset(D)+max (nvsize(D), dsize(D)), align(C) to max (align(C), align(D))**. **If D is any other data member, update dsize(C) to offset(D)+sizeof(D), align(C) to max (align(C), align(D))**.  
...
>
> After all such components have been allocated, set **nvalign(C) = align(C)** and **nvsize(C) = sizeof(C)**. The values of nvalign(C) and nvsize(C) will not change during virtual base allocation. Note that nvsize(C) need not be a multiple of nvalign(C).
>
> IV. Finalization  
For each potentially-overlapping non-static data member D of C, update sizeof(C) to max (sizeof(C), offset(D)+sizeof(D)). Then, round sizeof(C) up to a non-zero multiple of align(C). If C is a POD, but not a POD for the purpose of layout, set dsize(C) = nvsize(C) = sizeof(C). 

Let's follow the rules and see how it works for `MaybeDeleted<Foo>`.
1. Initialization  
    Per the ABI:

    |   Field    | Value |
    | :--------- | :---- |
    |   sizeof   |   0   |
    |   dsize    |   0   |
    |   align    |   1   |

2. `[[no_unique_address]] T val; // T = Foo`  
    `val` is a potentially-overlapping data member, so:
    $$
    \text{Let } \text{C} = \text{MaybeDeleted<Foo>},\;
    \text{D} = \text{MaybeDeleted<Foo>::val},
    $$
    $$
    \begin{aligned}
    \text{offset}(\text{D}) &= 0 \\
    \text{sizeof}(\text{C}) &=
    \max(\text{sizeof}(\text{C}),\,
        \text{offset}(\text{D}) + \max(\text{nvsize}(\text{D}), \text{dsize}(\text{D}))) \\
    &= \max(0,\, 0 + \max(16, 16)) = 16 \\[0.5em]
    \text{dsize}(\text{C}) &=
    \text{offset}(\text{D}) + \max(\text{nvsize}(\text{D}), \text{dsize}(\text{D})) \\
    &= 0 + \max(16, 16) = 16 \\[0.5em]
    \text{align}(\text{C}) &=
    \max(\text{align}(\text{C}), \text{align}(\text{D})) \\
    &= \max(1, 8) = 8
    \end{aligned}
    $$

    |   Field    | Value |
    | :--------- | :---- |
    |   sizeof   |   16  |
    |   dsize    |   16  |
    |   align    |   8   |
3. `bool deleted`  
    `deleted` is a normal (non potentially-overlapping) data member, hence:
    $$
    \text{Let } \text{C} = \text{MaybeDeleted<Foo>},\;
    \text{D} = \text{MaybeDeleted<Foo>::deleted},
    $$
    $$
    \begin{aligned}
    \text{offset}(\text{D}) &= 16 \\
    \text{sizeof}(\text{C}) &=
    \max(\text{sizeof}(\text{C}),\,
        \text{offset}(\text{D}) + \text{sizeof}(\text{D})) \\
    &= \max(16,\, 16 + 1) = 17 \\[0.5em]
    \text{dsize}(\text{C}) &=
    \text{offset}(\text{D}) + \text{sizeof}(\text{D}) \\
    &= 16 + 1 = 17 \\[0.5em]
    \text{align}(\text{C}) &=
    \max(\text{align}(\text{C}), \text{align}(\text{D})) \\
    &= \max(8, 1) = 8
    \end{aligned}
    $$

    |   Field    | Value |
    | :--------- | :---- |
    |   sizeof   |   17  |
    |   dsize    |   17  |
    |   align    |   8   |

4. Final Step of Allocation of Members Other Than Virtual Bases  
    Set `nvalign(MaybeDeleted<Foo>)` = `align(MaybeDeleted<Foo>)` and `nvsize(MaybeDeleted<Foo>)` = `sizeof(MaybeDeleted<Foo>)`:  

    |   Field    | Value |
    | :--------- | :---- |
    |   sizeof   |   17  |
    |   dsize    |   17  |
    |   align    |   8   |
    |   nvsize   |   17  |
    |   nvalign  |   8   |

5. Finalization  
    Per the ABI, round `sizeof(MaybeDeleted<Foo>)` up to a non-zero multiple of `align(MaybeDeleted<Foo>)` (Note that under GCC, `MaybeDeleted<Foo>` is not a POD type):

    |   Field    | Value |
    | :--------- | :---- |
    |   sizeof   |   24  |
    |   dsize    |   17  |
    |   align    |   8   |
    |   nvsize   |   17  |
    |   nvalign  |   8   |

Whew, that's a lot of work just to confirm what we already observed experimentally. So what now?

# What went wrong?
If you observe carefully, the real issue is that `Foo` is a POD. Note that even if `Foo` is not a POD for the purpose of layout, this alone does not solve the issue due to the Finalization rules in the Itanium C++ ABI [Non-POD Class Types Rules](https://itanium-cxx-abi.github.io/cxx-abi/abi.html#class-types). The ABI explicitly assigns special treatment to POD types. In particular, the Itanium C++ ABI POD rules state:
> The **dsize, nvsize, and nvalign of these types are defined to be their ordinary size and alignment**. These properties only matter for non-empty class types that are used as base classes. We **ignore tail padding for PODs** because the standard before the resolution of CWG issue 43 did not allow us to use it for anything else and because it sometimes permits faster copying of the type.

If this is the case, let’s test the theory experimentally:
```cpp
struct Foo {
private: // no longer an aggregate by C++03 standards
    long long foo_val;
    bool      foo_val2;
};

template <typename T>
struct MaybeDeleted {
    [[no_unique_address]] T val;
    bool deleted;
};

static_assert(sizeof(Foo) == 16);
static_assert(alignof(Foo) == 8);
static_assert(sizeof(MaybeDeleted<Foo>) == 16);
```
Hey, it passes! Skipping the detailed derivation, the values obtained by following the ABI rules are:  
For `Foo`:

|   Field    | Value |
| :--------- | :---- |
|   sizeof   |   16  |
|   dsize    |   9   |
|   align    |   8   |
|   nvsize   |   9   |
|   nvalign  |   8   |

For `MaybeDeleted<Foo>`:

|   Field    | Value |
| :--------- | :---- |
|   sizeof   |   16  |
|   dsize    |   10  |
|   align    |   8   |
|   nvsize   |   10  |
|   nvalign  |   8   |


In fact, we can generalize this pattern safely by introducing an empty base class. Any type that inherits from it becomes a non-aggregate, and therefore non-POD:
```cpp
// Users who want to allow overlap can just inherit from this mixin
struct AllowOverlapMixin {};

struct Foo: AllowOverlapMixin {
    long long foo_val;
    bool      foo_val2;
};

template <typename T>
struct MaybeDeleted {
    [[no_unique_address]] T val;
    bool deleted;
};

static_assert(sizeof(Foo) == 16);
static_assert(alignof(Foo) == 8);
static_assert(sizeof(MaybeDeleted<Foo>) == 16);
```
The best part? This trick works for both GCC and Clang (at least on x86-64)!

# Wrapping Up

Unfortunately, much of what we covered today is specific to the Itanium C++ ABI. I had originally hoped for a fully C++ standard–mandated solution, but it turns out that’s not possible... at least for now. All in all, I hope you had fun following along on this little adventure!

Till next time!

# Extra Content
A number of people kindly helped proof read this post, and several of them raised interesting questions and suggestions. I’ve collected a few of the most important ones here.
### Inheritance vs. composition for tail packing  
`u/fdwr` asked whether tail packing could work via inheritance rather than composition, for example:

```cpp
struct Foo {
private:
    long long foo_val;
    bool      foo_val2;
};

struct Bar: Foo {
    bool deleted;
};

static_assert(sizeof(Foo) == 16);
static_assert(alignof(Foo) == 8);
static_assert(sizeof(Bar) == 16);
```

Yes, this works with inheritance as well. The fundamental reason is that when `Foo` is a POD, both `dsize(Foo)` and `nvsize(Foo)` are forced to be equal to `sizeof(Foo)`. Once `Foo` is no longer a `POD`, `nvsize(Foo)` is allowed to be smaller, which enables tail padding reuse in derived classes.

This follows directly from the Itanium C++ ABI rules for base class layout:
> If D is a base class, update sizeof(C) to max (sizeof(C), offset(D)+nvsize(D)).  
> If D is a base class (not empty in this case), update dsize(C) to offset(D)+nvsize(D), and align(C) to max (align(C), nvalign(D)).

Since inheritance uses `nvsize(D)` rather than `sizeof(D)` in these calculations, reducing `nvsize(Foo)` allows Bar to reuse tail padding just as effectively as in the composition-based examples.

### Apple ARM64 differences (Clang)  
`u/LegitimateBottle4977` and `u/Affectionate-Soup-91` pointed out that on Apple ARM64 Clang, some of the earlier examples fail to compile because the `static_assert`s do not hold.

This turned out to be a Clang-specific ABI choice. After tracing the implementation, I found the relevant logic [here](https://github.com/llvm/llvm-project/blob/8e1f7793971b5d5b6516146260fe86ec6e0f8c1e/clang/include/clang/Basic/TargetCXXABI.h#L280-L305). On Apple ARM64 (and a few other targets), Clang uses the **C++11 definition of POD** for tail padding reuse rules. The rationale for this choice isn’t entirely clear, so I filed an issue with LLVM [here](https://github.com/llvm/llvm-project/issues/175486).
.

For Apple ARM64 Clang users who want the examples to work today, `u/LegitimateBottle4977` suggested a neat workaround, to explicitly make the type non-POD under the C++11 rules.
```cpp
template <typename T>
struct NotPod {};

struct Foo {
    long long foo_val;
    bool      foo_val2;
private:
    [[no_unique_address]] NotPod<Foo> not_pod_;
};

template <typename T>
struct MaybeDeleted {
    [[no_unique_address]] T val;
    bool deleted;
};

static_assert(sizeof(Foo) == 16);
static_assert(alignof(Foo) == 8);
static_assert(sizeof(MaybeDeleted<Foo>) == 16);
```
As long as you ensure the type is not a POD by C++11 standards, this approach works correctly on Apple ARM64 as well.

That’s all! Thanks again to everyone who helped proof read and provided thoughtful feedback!

# Resources
1. [Working Draft, Standard for Programming Language C++ (C++23)](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2023/n4950.pdf)
2. [cppreference](https://en.cppreference.com/)
3. [Itanium C++ ABI](https://itanium-cxx-abi.github.io/cxx-abi/abi.html)
4. [System V Application Binary Interface AMD64 Architecture Processor Supplement](https://gitlab.com/x86-psABIs/x86-64-ABI/-/jobs/artifacts/master/raw/x86-64-ABI/abi.pdf?job=build)
5. [Answer to "What are aggregates and trivial types/PODs, and how/why are they special?" on Stack Overflow](https://stackoverflow.com/a/4178176)
6. [Answer to "Can padding of bases or [[no_unique_address]] members be used to store other bases/members?" on Stack Overflow](https://stackoverflow.com/a/79699111)
7. [Proposal p0840r2](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2018/p0840r2.html)
8. ["POD for the purpose of layout" is underspecified Discussion](https://github.com/itanium-cxx-abi/cxx-abi/issues/66)
9. [\[no_unique_address\] Member not stored in previous member's padding Discussion](https://github.com/llvm/llvm-project/issues/50766)
10. [Answer to "On which member is no_unique_address needed and why?"](https://stackoverflow.com/questions/78779469/on-which-member-is-no-unique-address-needed-and-why)