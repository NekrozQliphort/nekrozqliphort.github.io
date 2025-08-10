---
title: "Learner's Notes: Looking at constexpr in C++20"
date: 2024-12-29 00:08:00 +0800
categories: [Learner's Notes, C++]
tags: [learners-notes, cs, c++]
comments: true    # TAG names should always be lowercase
---

# Study notes
https://stackoverflow.com/questions/31742318/are-all-template-instantiations-created-at-compile-time


# constexpr is weirder than I thought
The `constexpr` keyword in C++20 has some nuances that surprised me during my exploration. To begin unraveling its behavior, let's look at a simple example:
```c++
constexpr int times_2(const int x) {
    return 2 * x;
}

int main() {
    int x = times_2(1000);
    return x;
}
```
In this example, is the value of `x` evaluated at compile time? Well, not if you compile it without optimizations (-O0) on x86-64 clang (trunk), as shown [here](https://godbolt.org/z/W68W98j65). However, enabling optimizations (e.g., -O1) allows the compiler to evaluate `x` at compile time. So, the answer is: maybe!

Now, let's tweak the code slightly:
```c++
constexpr int times_2(const int x) {
    return 2 * x;
}

int main() {
    constexpr int x = times_2(1000);
    return x;
}
```
Here, `x` is explicitly marked as constexpr, and as expected, the compiler evaluates it at compile time, as seen on [Godbolt](https://godbolt.org/z/Ts59b3MnG). However, as Jason Turner points out in his C++ Weekly, this behavior isn’t guaranteed by the standard—it’s still just a maybe. Isn't that surprising?

This realization led me to dive deeper into `constexpr` and its limitations. What exactly does it do, and when can we rely on it? Let’s explore!

# constexpr functions may be evaluated during runtime

# constexpr variables 

# limitations of constexpr static
