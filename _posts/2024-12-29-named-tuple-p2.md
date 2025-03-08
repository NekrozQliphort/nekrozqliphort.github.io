---
title: "Learner's Notes: The Curious Case of How typing.NamedTuple Works (Part 2)"
date: 2024-12-29 00:08:00 +0800
categories: [Learner's Notes, Python]
tags: [learners-notes, cs, python]
# comments: true    # TAG names should always be lowercase
---

> **Quick Note**:  
If you haven’t already, take a look at Part 1 to catch up on what we’ve covered so far!
{: .prompt-tip }

# Picking Up Where We Left Off
In Part 1, we explored how `__mro_entries__()` works and how it allows bases to be substituted. Specifically, we saw this mechanism replaces `typing.NamedTuple` with `_NamedTuple`. But that’s not the full story! There’s more happening behind the scenes. 

Now it’s time to dive deeper and figure out what `_NamedTuple` really is and how the magic happens!

# Before _NamedTuple, There Was NamedTupleMeta
As we saw last time, `_NamedTuple` is defined as follows:
```python
_NamedTuple = type.__new__(NamedTupleMeta, 'NamedTuple', (), {})
```

To understand why this is written like that, we need to take a closer look at `NamedTupleMeta`:
```python
class NamedTupleMeta(type):
    def __new__(cls, typename, bases, ns):
        assert _NamedTuple in bases
        for base in bases:
            if base is not _NamedTuple and base is not Generic:
                raise TypeError(
                    'can only inherit from a NamedTuple type and Generic')
        bases = tuple(tuple if base is _NamedTuple else base for base in bases)
        types = ns.get('__annotations__', {})
        default_names = []
        for field_name in types:
            if field_name in ns:
                default_names.append(field_name)
            elif default_names:
                raise TypeError(f"Non-default namedtuple field {field_name} "
                                f"cannot follow default field"
                                f"{'s' if len(default_names) > 1 else ''} "
                                f"{', '.join(default_names)}")
        nm_tpl = _make_nmtuple(typename, types.items(),
                               defaults=[ns[n] for n in default_names],
                               module=ns['__module__'])
        nm_tpl.__bases__ = bases
        if Generic in bases:
            class_getitem = _generic_class_getitem
            nm_tpl.__class_getitem__ = classmethod(class_getitem)
        # update from user namespace without overriding special namedtuple attributes
        for key, val in ns.items():
            if key in _prohibited:
                raise AttributeError("Cannot overwrite NamedTuple attribute " + key)
            elif key not in _special:
                if key not in nm_tpl._fields:
                    setattr(nm_tpl, key, val)
                try:
                    set_name = type(val).__set_name__
                except AttributeError:
                    pass
                else:
                    try:
                        set_name(val, nm_tpl, key)
                    except BaseException as e:
                        e.add_note(
                            f"Error calling __set_name__ on {type(val).__name__!r} "
                            f"instance {key!r} in {typename!r}"
                        )
                        raise

        if Generic in bases:
            nm_tpl.__init_subclass__()
        return nm_tpl
```
> I’m using CPython’s 3.13 implementation here since it’s more concise compared to newer versions, which add `annotationlib` into the mix.
{: .prompt-tip }

Good news: there’s only one method to analyze here. Bad news: it’s a metaclass method. Brace yourself!

# Speedrunning metaclasses
This is where knowing about metaclasses comes into play. If you’re already familiar with metaclasses, feel free to skim this section. For the rest of us, here’s the TLDR.

First of all: classes are objects. That’s right, Python classes are instances of another class called `type`! A metaclass is a class whose instances are other classes. In other words, metaclasses are subclasses of `type` that customize how classes are created.

When you define a class in Python, a lot happens under the hood, but eventually Python calls the metaclass's `__new__()` method (or its bases) to create the class object. This is where the magic happens: `__new__()` can customize the creation process, inject attributes, or validate inputs.

To see this in action, let’s revisit our `ExampleNamedTuple` class. When `ExampleNamedTuple` is created, the following arguments are passed to `NamedTupleMeta.__new__()`:

```
Arguments for NamedTupleMeta's __new__() 
cls: <class 'typing.NamedTupleMeta'>
typename: ExampleNamedTuple
bases: (<class 'typing.NamedTuple'>,)
ns: {'__module__': '__main__', '__qualname__': 'ExampleNamedTuple', '__firstlineno__': 3, '__annotations__': {'intField': <class 'int'>, 'strField': <class 'str'>}, 'strField': '', '__static_attributes__': (), '__orig_bases__': (<function NamedTuple at 0x10519afc0>,)}
```
Here are a few takeways:
- `cls`: This is the metaclass itself (`NamedTupleMeta`).
- `typename`: A `str` containing the name of the class being created (`ExampleNamedTuple`).
- `bases`: A tuple containing the original bases (`typing.NamedTuple` in this case).
- `ns`: The class namespace, which holds all the attributes defined inside the class.

Now, lets see how this `ExampleNamedTuple` is created.

# Digesting NamedTupleMeta's \_\_new\_\_() implementation
At first glance, the `__new__()` method might look a bit intimidating, but don’t worry, we’re only focusing on one particular section. The rest of the method handles things like extra checks, the quirks of subclassing `Generic`, and skipping `type.__new__()` after constructing this custom class. If there’s enough interest, we might dig into those details another time. For now, let’s zero in on this part:

```python
bases = tuple(tuple if base is _NamedTuple else base for base in bases)
types = ns.get('__annotations__', {})
default_names = []
for field_name in types:
    if field_name in ns:
        default_names.append(field_name)
    elif default_names:
        raise TypeError(f"Non-default namedtuple field {field_name} "
                        f"cannot follow default field"
                        f"{'s' if len(default_names) > 1 else ''} "
                        f"{', '.join(default_names)}")
nm_tpl = _make_nmtuple(typename, types.items(),
                               defaults=[ns[n] for n in default_names],
                               module=ns['__module__'])
nm_tpl.__bases__ = bases
```

Here’s the breakdown of what’s going on:
1. Replacing `_NamedTuple` with `tuple`:
`_NamedTuple` serves as a placeholder base. This line:
```python
bases = tuple(tuple if base is _NamedTuple else base for base in bases)
```
replaces `_NamedTuple` with `tuple`. Later, the new bases are assigned back to the class using `nm_tpl.__bases__ = bases`.

2. Processing `__annotations__`:
The code loops through `__annotations__` to grab all the field names, identifies those with default values, and ensures fields without defaults don’t follow fields that do have defaults. If they do, Python raises a `TypeError`.

3. Creating the final class:
`_make_nmtuple` constructs the final class (which eventually relies on `collections.namedtuple`), bundles all the fields, and gets it ready to return.

So, there you have it: this section explains how `_NamedTuple` is substituted as `tuple` and how the fields for the `NamedTuple` are prepared. But wait, there’s still one question left hanging: how does `_NamedTuple` tie into `NamedTupleMeta` in the first place?

# Unraveling the final mystery of using type.\_\_new\_\_()
Let’s come full circle and revisit this line:
```python
_NamedTuple = type.__new__(NamedTupleMeta, 'NamedTuple', (), {})
```
What exactly is happening here? Well, remember that `type` is a metaclass, and calling `type.__new__()` is essentially creating a class named `NamedTuple` that’s an instance of `NamedTupleMeta`. This newly created class is assigned to a variable called `_NamedTuple`.

Now, you might be thinking, “Why not just do this?”
```python
class NamedTupleClass(metaclass = NamedTupleMeta):
    ...
_NamedTuple = NamedTupleClass
```
It’s a good question, but it doesn’t work for a few reasons. First, doing this would lead to an error because `_NamedTuple` hasn’t been defined before being used in `NamedTupleMeta.__new__()`. But even if it did work, the real issue is that, while we want the class `_NamedTuple` to be an instance of `NamedTupleMeta`, we don’t want the creation of `_NamedTuple` itself to go through `NamedTupleMeta.__new__()`. If it did, `_NamedTuple` would become a subclass of `tuple`, which isn’t the desired behavior.

Instead, we only want any other class that has `_NamedTuple` as part of its base to go through `NamedTupleMeta.__new__()`. This is why we call `type.__new__()`. It creates the class with the correct metaclass setup, but without invoking `NamedTupleMeta.__new__()` in the process.

# Wrapping Up... For Now
And that's a wrap! I hope this series has helped clear up how `typing.NamedTuple` works. I didn’t dive into how it interacts with `Generic` in this post, though. I thought about including it here but figured it might need its own post, as there’s quite a bit to unpack. If you’re curious about that, drop a comment and let me know and I might just tackle it in a future post!

Till next time!

# References
1. [Fluent Python, 2nd Edition Chapter 24](https://www.oreilly.com/library/view/fluent-python-2nd/9781492056348/)