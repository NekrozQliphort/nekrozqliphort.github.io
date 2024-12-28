---
title: "Learner's Notes: The Curious Case of How typing.NamedTuple Works - Part 1"
date: 2024-12-29 00:08:00 +0800
categories: [Learner's Notes, Python]
tags: [learners-notes, cs, python]
# comments: true    # TAG names should always be lowercase
---

> **Quick Note**:  
This series assumes some familiarity with Python metaclasses. If you're new to this topic, I highly recommend checking out **Fluent Python, 2nd Edition, Chapter 24: Class Metaprogramming** by Luciano Ramalho.  I might explore this topic myself in the future so stay tuned (or maybe not, no promises).
{: .prompt-tip }

# What is typing.NamedTuple and How to Use It
For those unfamiliar with `typing.NamedTuple`, here's a quick example to illustrate how it works:
```python
from typing import NamedTuple

class ExampleNamedTuple(NamedTuple):
    intField: int
    strField: str = ""

exampleNamedTupleObject = ExampleNamedTuple(100, "200")

print(f"Type Annotations: {ExampleNamedTuple.__annotations__}")
print(f"Access through indexing: {exampleNamedTupleObject[0]}")
print(f"Access through name: {exampleNamedTupleObject.intField}")
print(f"Iterable: {[field for field in exampleNamedTupleObject]}")
print(f"The class attributed are descriptors: {ExampleNamedTuple.intField}")
```

Here’s the output:
```
Type Annotations: {'intField': <class 'int'>, 'strField': <class 'str'>}
Access through indexing: 100
Access through name: 100
Iterable: [100, '200']
The class attributes are descriptors: _tuplegetter(0, 'Alias for field number 0')
```

`typing.NamedTuple` is essentially a typed version of `collections.namedtuple`. It allows you to define immutable, tuple-like objects with type annotations (stored in the `__annotations__` attribute), making your code both more readable and type-safe. These `tuple`-like objects combine the flexibility of tuples (indexing and iteration) with the clarity and readability of named attributes.

However, this post isn’t about the inner workings of `collections.namedtuple`. Instead, we’re exploring how `typing.NamedTuple` takes things further. At first glance, it might seem like a straightforward case of inheritance. But a closer inspection reveals an unexpected twist.

```python
from typing import NamedTuple

class ExampleNamedTuple(NamedTuple):
    intField: int
    strField: str = ""

print(f"Base Classes of ExampleNamedTuple: {ExampleNamedTuple.__bases__}")
print(f"Type of typing.NamedTuple: {type(NamedTuple)}")
```

Take a guess at the output. Ready?  

```
Base Classes of ExampleNamedTuple: (<class 'tuple'>,)
Type of typing.NamedTuple: <class 'function'>
```

Wait a second, `ExampleNamedTuple` doesn’t even inherit from `typing.NamedTuple`? And stranger still, `typing.NamedTuple` is a `function`, not a `class`?

# Wait, typing.NamedTuple is a function?
Indeed, `typing.NamedTuple` is a `function`. Let’s dive into [CPython’s implementation](https://github.com/python/cpython/blob/main/Lib/typing.py#L3030-L3102):
```python
def NamedTuple(typename, fields=_sentinel, /, **kwargs):
    ...

_NamedTuple = type.__new__(NamedTupleMeta, 'NamedTuple', (), {})

def _namedtuple_mro_entries(bases):
    assert NamedTuple in bases
    return (_NamedTuple,)

NamedTuple.__mro_entries__ = _namedtuple_mro_entries
```
At first glance, we might be tempted to focus on the contents of `NamedTuple`, but they’re actually not crucial unless we use it like this:
```python
ExampleNamedTuple = NamedTuple('ExampleNamedTuple', [('intField', int), ('strField', str)])
```
What really matters here are these lines:
```python
def _namedtuple_mro_entries(bases):
    assert NamedTuple in bases
    return (_NamedTuple,)

NamedTuple.__mro_entries__ = _namedtuple_mro_entries
```
The key to understanding how this works lies in `__mro_entries__()`. This method is a pivotal part of the puzzle. Let’s break it down further.

# Diving into \_\_mro_entries()\_\_
So, what exactly is `__mro_entries__()`? Let's refer to the official documentation:
> `object.__mro_entries__(self, bases)`  
If a base that appears in a class definition is not an instance of `type`, then an `__mro_entries__()` method is searched on the base. If an `__mro_entries__()` method is found, the base is substituted with the result of a call to `__mro_entries__()` when creating the class. The method is called with the **original bases tuple** passed to the bases parameter, and must return a tuple of classes that will be used instead of the base. The returned tuple may be empty: in these cases, the original base is ignored.

In simple terms, if a base is not a `class` (i.e., an instance of `type`), Python will attempt to call the base's `__mro_entries__()` method, which returns a new set of bases to be substituted. Let’s look at an example:
```python
class RealClass:
    ...

def FakeClass(bases):
    print(f"Bases passed to FakeClass: {bases}")
    return (RealClass,)
FakeClass.__mro_entries__ =  FakeClass

class Test(FakeClass):
    ...

print(f"Bases of Test: {Test.__bases__}")
```

This will output:
```
Bases passed to FakeClass: (<function FakeClass at 0x1009cd4e0>,)
Bases of Test: (<class '__main__.RealClass'>,)
```
During the creation of `Test`, Python notices that the base `FakeClass` is not an instance of `type`. As a result, it calls the `__mro_entries__()` method of `FakeClass`, passing the bases of `Test` as a `tuple` (i.e., `(FakeClass,)`). The `FakeClass` function serves as the `__mro_entries__()` implementation, printing the received bases and returning `(RealClass,)`. Python then replaces the `FakeClass` base in `Test` with `RealClass`.

But for those curious minds, you might wonder: Why was `__mro_entries__()` introduced in the first place? This puzzled me as well, and that’s why, in the next section, we’ll take a detour and explore the use case of `__mro_entries__()` in more detail.

# The Unexpected Issue with Inheritance
Let’s take a look at the following code:
```python
from typing import List, Any

class StrictIntList(List[int]):
    def append(self, value: Any) -> None:
        if not isinstance(value, int):
            raise TypeError("Only integers can be added to this list.")
        super().append(value)
```
> While I'm aware of [PEP 585](https://peps.python.org/pep-0585/) and the fact that `list[int]` now replaces the need for `List[int]`, I prefer using `List[int]` as our example here, as the implementation details are all in Python, unlike `list[int]`, whose details are in C.
{: .prompt-tip }

From the outside looking in, the goal seems clear: `StrictIntList` should be a subclass of `list`. But here's the issue: `List[int]` doesn’t actually return a `list`; instead, it returns an instance of `typing._GenericAlias`. This creates a problem, as the base is not an instance of `type`.

To remedy this, [PEP 560](https://peps.python.org/pep-0560/) introduces the `__mro_entries__()` method. This allows `typing._GenericAlias` to be replaced with the actual base class we expect (`list`). Let’s add some additional code to illustrate:

```python
print(f"__mro_entries__() return value: {List[int].__mro_entries__((List[int],))}")
print(f"Bases of StrictIntList: {StrictIntList.__bases__}")
```
The output reveals that `list` is indeed one of the returned bases, along with `typing.Generic` (though that’s outside the scope of this discussion for now):
```
__mro_entries__() return value: (<class 'list'>, <class 'typing.Generic'>)
Bases of StrictIntList: (<class 'list'>, <class 'typing.Generic'>)
```

# Back to NamedTuple, or is it _NamedTuple, or neither?
Let’s revisit our initial code snippet:
```python
_NamedTuple = type.__new__(NamedTupleMeta, 'NamedTuple', (), {})

def _namedtuple_mro_entries(bases):
    assert NamedTuple in bases
    return (_NamedTuple,)

NamedTuple.__mro_entries__ = _namedtuple_mro_entries
```
We now know that the base `NamedTuple` will be replaced with `_NamedTuple`. However, as we've seen earlier, `ExampleNamedTuple` only inherits from `tuple`, so something else must be going on behind the scenes. Indeed, there is more to the story, and to understand it, we need to take a closer look at what `NamedTupleMeta` does.

# What's Coming in Part 2
We’ve covered a lot of ground here, so let’s leave the rest for Part 2. To recap, in Part 1, we’ve introduced the mystery of how `typing.NamedTuple` works and explained the first part of the puzzle: `__mro_entries__()`, along with its use case. In Part 2, we’ll dive into how `NamedTupleMeta` works, why `type.__new__()` is used, and how these pieces fit together to give us a complete picture of how everything works.

Till next time!

# References
1. [Fluent Python, 2nd Edition Chapter 24](https://www.oreilly.com/library/view/fluent-python-2nd/9781492056348/)
2. [Python Documentation - Data model](https://docs.python.org/3/reference/datamodel.html#object.__mro_entries__)
3. [PEP 560](https://peps.python.org/pep-0560/#dynamic-class-creation-and-types-resolve-bases)