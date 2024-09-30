---
title: "Learner's Notes: A Descriptive Dive into Python Descriptors"
date: 2024-09-30 20:49:00 +0800
categories: [Learner's Notes, Python]
tags: [learners-notes, cs, python]
comments: true    # TAG names should always be lowercase
---

> **Quick Announcement**:  
I hate to break it to you, but updates might be a bit slower around here. Blame work!
{: .prompt-tip }

# Introduction
As Davide Mastromatteo explains in his article on Descriptors, "Descriptors are a specific Python feature that power a lot of the magic hidden under the language’s hood." Before diving into the details, let’s start with a small, intriguing example:
```python
class C:
    attr: int = 123
    def func(self):
        print("I am a method")

c = C()
print(C.func, c.func, C.attr, c.attr, sep = '\n')
```
Running this code gives the following output:
<blockquote>
<function C.func at 0x100e71580><br>
<bound method C.func of <__main__.C object at 0x100eea570>><br>
123<br>
123
</blockquote>
Notice something interesting? While `C.func` and `c.func` return different objects, `C.attr` and `c.attr` behave the same way. Why the difference? This is where descriptors come into play, shedding light on the underlying mechanism.

# What is a descriptor?
A descriptor is any object which defines the methods `__get__()`, `__set__()`, or `__delete__()`. More specifically, here are their method signatures:
```python
obj.__get__(self, instance, owner=None)
obj.__set__(self, instance, value)
obj.__delete__(self, instance)
```

What makes descriptors special is when they are assigned as class attributes. Let’s take a look at what makes them unique:
```python
class ExampleDescriptor:
    def __get__(self, instance, owner=None):
        return f"Calling ExampleDescriptor's __get__({self}, {instance}, {owner})"

    def __set__(self, instance, value):
        print(f"Calling ExampleDescriptor's __set__({self}, {instance}, {value})")

class ExampleClass:
    cnt = 1
    ed = ExampleDescriptor()

example_obj = ExampleClass()
print(example_obj.cnt, example_obj.ed, sep='\n')
```
Notice in our output, when we access `ed`, instead of getting the `ExampleDescriptor` instance, it actually calls the `__get__()` method.
<blockquote>
1<br>
Calling ExampleDescriptor's __get__(<__main__.ExampleDescriptor object at 0x105116ba0>, <__main__.ExampleClass object at 0x105116cc0>, <class '__main__.ExampleClass'>)
</blockquote>

Indeed, as the astute among you might have guessed, assigning values to `ed` also calls the `__set__()` method. Now that we know roughly what a descriptor is and how it behaves, lets get into more details about the methods.

# \_\_get\_\_() and \_\_set\_\_()
We won't dive into `__delete__()` since it's not as commonly used as the other two methods. Instead, let’s focus on `__get__()`, which plays a crucial role in how descriptors work. Here's how Python's official documentation describes it:
> Called to get the attribute of the owner class (class attribute access) or of an instance of that class (instance attribute access). The optional owner argument is the owner class, while instance is the instance that the attribute was accessed through, or None when the attribute is accessed through the owner.

If that feels like a lot to digest, let’s break it down with an example from earlier:
```python
class ExampleDescriptor:
    def __get__(self, instance, owner=None):
        return f"Calling ExampleDescriptor's __get__({self}, {instance}, {owner})"

    def __set__(self, instance, value):
        print(f"Calling ExampleDescriptor's __set__({self}, {instance}, {value})")

class ExampleClass:
    cnt = 1
    ed = ExampleDescriptor()

example_obj = ExampleClass()
print(example_obj.cnt, example_obj.ed, sep='\n')
```
Here’s how it works:
- `self` refers to the descriptor instance itself, which is assigned to the class attribute `ed`.
- `instance` is the instance of the owner class, i.e. `example_obj`.
- `owner` is the owner class, i.e. ExampleClass.

All of this is clearly visible in the output. When you access `example_obj.ed`, it triggers the `__get__()` method, and you can see the values passed for self, instance, and owner.

Let's contrast this with `__set__()`.
> Called to set the attribute on an instance `instance` of the owner class to a new value, `value`.

If we run the following line:
```python
example_obj.ed = 100
```
We get the following output:
<blockquote>
Calling ExampleDescriptor's __set__(<__main__.ExampleDescriptor object at 0x102d6ac30>, <__main__.ExampleClass object at 0x102d6ad50>, 100)
</blockquote>
Here, the new parameter is `value`, which holds the new value being assigned.

It’s also worth noting that you can call `__get__()` by accessing the descriptor through the class itself. In that case, running ExampleClass.ed would yield:
<blockquote>
Calling ExampleDescriptor's __get__(<__main__.ExampleDescriptor object at 0x100b6eb40>, None, <class '__main__.ExampleClass'>)
</blockquote>
The key difference here is that instance is None because we’re accessing the descriptor directly from the class, not through an instance. It is usual practice to return the descriptor instance when this is the case. Importantly, when assigning a value to the attribute that holds the descriptor directly through the class (instead of through an instance), the `__set__()` method won't be triggered. As a result, there aren't any scenarios where instance is `None` during a `__set__()` call (unless explicitly done by the user).

While there’s still more to unpack regarding `__get__()` and `__set__()`, we’ll save that for later discussions.

# Are Methods Descriptors?
Looping back to our initial example, let’s dig into whether there's anything special about `func`.
```python
class C:
    def func(self):
        print("I am a method")

c = C()
print(C.func.__get__(c) == c.func)
```
Surprisingly, they are equal! This shows that `C.func` is indeed a descriptor, and by calling `__get__()` manually, we can achieve the same result as simply accessing `c.func`.

The following examples are inspired by the Descriptor Guide from the Python documentation:

It turns out that methods can be created manually using `types.MethodType`, which is roughly equivalent to this implementation:
```python
class MethodType:
    "Emulate PyMethod_Type in Objects/classobject.c"

    def __init__(self, func, obj):
        self.__func__ = func
        self.__self__ = obj

    def __call__(self, *args, **kwargs):
        func = self.__func__
        obj = self.__self__
        return func(obj, *args, **kwargs)
```

To support the automatic creation of methods, functions include the `__get__()` method, which handles binding methods during attribute access. Here’s how it works under the hood:
```python
class Function:
    ...

    def __get__(self, obj, objtype=None):
        "Simulate func_descr_get() in Objects/funcobject.c"
        if obj is None:
            return self
        return MethodType(self, obj)
```

With this, we now know how methods work. Function objects are descriptors that return a `MethodType` when accessed via an instance (`obj` is not None). This `MethodType` is callable and automatically inserts the instance (`obj`) as the first argument, followed by the remaining arguments. Essentially, if `f` is the Function instance that creates the `MethodType`, then calling it results in `f(obj, *args, **kwargs)`.

Armed with this knowledge, we can even do something a little unconventional:
```python
def f(self):
    print(f"This is not a method, but I still printed {self}")

class A:
    def __repr__(self):
        return "object of type A"
a = A()
f.__get__(a)()
```
In this case, we're manually using `__get__()` to bind a non-method function f to the instance a, and it behaves just like a method!

When a method is defined in class, it is stored as a function which are non-data descriptors that return bound methods when accessed through an instance.

# Data Descriptors and Non-Data Descriptors
Back to `__get__()` and `__set__()`. If an object defines `__set__()` or `__delete__()`, it is considered a data descriptor. Descriptors that only define `__get__()` are called non-data descriptors. But why make this distinction?  
Let’s take a look at the following example:
```python
class DataDescriptor:
    def __get__(self, inst, owner = None):
        return "Calling the __get__() of DataDescriptor"
    def __set__(self, inst, val):
        print("Calling the __set__() of DataDescriptor")

class NonDataDescriptor:
    def __get__(self, inst, owner = None):
        return "Calling the __get__() of NonDataDescriptor"
    
class Test:
    dd = DataDescriptor()
    ndd = NonDataDescriptor()

t = Test()
print(vars(t))
print(t.dd, t.ndd, sep=' | ')
t.__dict__['dd'] = t.__dict__['ndd'] = 100
print(t.dd, t.ndd, sep=' | ')
```
Here's the output:
<blockquote>
{}<br>
Calling the __get__() of DataDescriptor | Calling the __get__() of NonDataDescriptor<br>
Calling the __get__() of DataDescriptor | 100
</blockquote>
What’s happening here?  
This is due to how instance attribute lookup works. When Python looks for an attribute, it follows a specific order:
1. Data Descriptors (like `dd`) get the highest priority.
2. Instance Variables come next.
3. Non-data Descriptors (like `ndd`).
4. Class Variables.
5. If none of these work, it falls back to `__getattr__()` if defined.

In this example, even though we assigned 100 to both `dd` and `ndd` in the instance’s `__dict__`, the data descriptor `dd` still has higher priority. However, the non-data descriptor ndd allows the instance variable to take precedence, so we see 100 when accessing `t.ndd` after the assignment.

This also explains why we can shadow methods with instance variables:
```python
class Test:
    def func(self):
        return
    
t = Test()
decriptor_inst = Test.func

print(f"Does __get__() exist? {callable(getattr(decriptor_inst.__class__, '__get__', None))}")
print(f"Does __set__() exist? {callable(getattr(decriptor_inst.__class__, '__set__', None))}")

print(vars(t))
print(f"Before instance variable func is defined: {t.func}")
t.__dict__['func'] = 100
print(f"After instance variable func is defined: {t.func}")
del t.func
print(f"After instance variable func is deleted: {t.func}")
```

Here’s the output:
<blockquote>
Does __get__() exist? True<br>
Does __set__() exist? False<br>
{}<br>
Before instance variable func is defined: <bound method Test.func of <__main__.Test object at 0x104a6ebd0>><br>
After instance variable func is defined: 100<br>
After instance variable func is deleted: <bound method Test.func of <__main__.Test object at 0x104a6ebd0>>
</blockquote>

Notice a few things here:
1. `Test.func` has a `__get__()` method, but not `__set__()`, making it a non-data descriptor.
2. Before we define an instance variable `func`, accessing `t.func` returns the bound method (via the descriptor).
3. After assigning 100 to `t.func`, the instance variable takes precedence and shadows the non-data descriptor.
4. Once we delete the instance variable `func`, the original method is accessible again, thanks to the `__get__()` method of the descriptor.

This priority system explains why functions, being non-data descriptors, allow instance variables to temporarily override them.

# @property 
You might be thinking, "Wait, doesn’t `@property` already modify behavior for attribute access?" And you'd be right! But here’s the kicker: property itself is a descriptor.

Let’s take a look:
```python
class Test:
    @property
    def property_test(self):
        return "This is from property_test"
    
t = Test()
print(f"Does __get__() exist? {callable(getattr(Test.property_test.__class__, '__get__', None))}")
print(f"Does __set__() exist? {callable(getattr(Test.property_test.__class__, '__set__', None))}")
print(f"Does __delete__() exist? {callable(getattr(Test.property_test.__class__, '__delete__', None))}")

t.__dict__["property_test"] = 100
print(t.property_test)
```
The output is shown below:
<blockquote>
Does __get__() exist? True<br>
Does __set__() exist? True<br>
Does __delete__() exist? True<br>
This is from property_test
</blockquote>
Notice a few key things:
1. `__get__()`, `__set__()` and `__delete__()` are all defined for the property class, making it a data descriptor.
2. Even after we set an attribute in `t.__dict__`, accessing `t.property_test` still triggers the `__get__()` method of the descriptor.

We can further understand this behavior by looking at a simplified Python equivalent of the built-in property:
```python
class Property:
    "Emulate PyProperty_Type() in Objects/descrobject.c"

    def __init__(self, fget=None, fset=None, fdel=None, doc=None):
        self.fget = fget
        self.fset = fset
        self.fdel = fdel
        if doc is None and fget is not None:
            doc = fget.__doc__
        self.__doc__ = doc
        self._name = ''

    def __set_name__(self, owner, name):
        self._name = name

    def __get__(self, obj, objtype=None):
        if obj is None:
            return self
        if self.fget is None:
            raise AttributeError(
                f'property {self._name!r} of {type(obj).__name__!r} object has no getter'
             )
        return self.fget(obj)

    def __set__(self, obj, value):
        if self.fset is None:
            raise AttributeError(
                f'property {self._name!r} of {type(obj).__name__!r} object has no setter'
             )
        self.fset(obj, value)

    def __delete__(self, obj):
        if self.fdel is None:
            raise AttributeError(
                f'property {self._name!r} of {type(obj).__name__!r} object has no deleter'
             )
        self.fdel(obj)

    def getter(self, fget):
        prop = type(self)(fget, self.fset, self.fdel, self.__doc__)
        prop._name = self._name
        return prop

    def setter(self, fset):
        prop = type(self)(self.fget, fset, self.fdel, self.__doc__)
        prop._name = self._name
        return prop

    def deleter(self, fdel):
        prop = type(self)(self.fget, self.fset, fdel, self.__doc__)
        prop._name = self._name
        return prop
```
This Property class behaves like the built-in property descriptor. It stores a getter (`fget`), setter (`fset`), and deleter (`fdel`). When accessed, it checks if these methods exist and, if so, invokes them with the instance as the argument.

This makes the `@property` decorator both flexible and powerful, as it essentially wraps functions into a data descriptor that controls attribute access.

# Introduction of \_\_set_name\_\_()
In the Property class above, there’s an interesting method, `__set_name__()`. This feature was added in Python 3.6 to help descriptors manage attribute names within their owner class. The method is automatically called when the class is created, and it has the following signature:
```python
obj.__set_name__(self, owner, name)
```
Here:
1. `owner` refers to the class that owns the descriptor (i.e., the class where the descriptor is defined as an attribute).
2. `name` is the name of the attribute within that class that holds the descriptor.

This method is particularly useful for situations where the descriptor needs to know the name of the attribute it’s bound to, which can be helpful when generating error messages or logging. You’ll often see it used in descriptors that handle multiple attributes dynamically or when customizing behavior based on the attribute name.

# Use Cases
To demonstrate how descriptors can simplify repetitive tasks, let’s consider a scenario where we want to log access to attributes. Typically, with Python's `@property` decorator, we might start by writing something like this:
```python
class Test:
    def __init__(self):
        self._x = None

    @property
    def x(self):
        print("[INFO] Accessing x through getter")
        return self._x
    
    @x.setter
    def x(self, value):
        print("[INFO] Accessing x through setter")
        self._x = value
```
In this example, every time we access or modify `x`, a message is printed. This works great for one or two attributes, but what happens if we add more attributes like `y` and `z`? We’d have to repeat the same property logic for each of them:
```python
class Test:
    def __init__(self):
        self._x = None
        self._y = None
        self._z = None

    @property
    def x(self):
        print("[INFO] Accessing x through getter")
        return self._x

    @x.setter
    def x(self, value):
        print("[INFO] Accessing x through setter")
        self._x = value

    @property
    def y(self):
        print("[INFO] Accessing y through getter")
        return self._y

    @y.setter
    def y(self, value):
        print("[INFO] Accessing y through setter")
        self._y = value

    @property
    def z(self):
        print("[INFO] Accessing z through getter")
        return self._z

    @z.setter
    def z(self, value):
        print("[INFO] Accessing z through setter")
        self._z = value
```
It works, but there’s a lot of repetition here—violating the DRY (Don’t Repeat Yourself) principle. Maintaining this approach becomes cumbersome, especially as the number of attributes grows.

This is where descriptors come to the rescue. With descriptors, we can abstract the repetitive behavior into a reusable component. Instead of writing properties for each attribute, we can define a descriptor that handles the logging for us. Let’s refactor the example to use a custom descriptor:
```python
class PrivateLogger:
    def __init__(self, name):
        self._name = name
        self._actual_name = "_" + name

    def __get__(self, instance, owner):
        if instance is None:
            return self
        print(f"[INFO] Accessing {self._name} through getter")
        return getattr(instance, self._actual_name)

    def __set__(self, instance, value):
        print(f"[INFO] Accessing {self._name} through setter")
        setattr(instance, self._actual_name, value)
```
Now, we can easily apply this descriptor to multiple attributes without repeating ourselves:
```python
class Test:
    x = PrivateLogger('x')
    y = PrivateLogger('y')
    z = PrivateLogger('z')

    def __init__(self):
        self._x = None
        self._y = None
        self._z = None
```
While the above solution is better, manually passing the attribute name (`x`, `y`, `z`) to the `PrivateLogger` still leaves room for error. A typo in the name would cause unexpected behavior. Fortunately, we can improve our `PrivateLogger` by utilizing `__set_name__()`:
```python
class PrivateLogger:
    def __init__(self):
        self._name = ""
        self._actual_name = ""
    
    def __set_name__(self, owner, name):
        self._name = name
        self._actual_name = "_" + name

    def __get__(self, instance, owner):
        if instance is None:
            return self
        print(f"[INFO] Accessing {self._name} through getter")
        return getattr(instance, self._actual_name)

    def __set__(self, instance, value):
        print(f"[INFO] Accessing {self._name} through setter")
        setattr(instance, self._actual_name, value)
```
With this new version, we no longer need to pass the attribute names manually. The descriptor takes care of everything:
```python
class Test:
    x = PrivateLogger()
    y = PrivateLogger()
    z = PrivateLogger()

    def __init__(self):
        self._x = None
        self._y = None
        self._z = None
```
Now, the code is cleaner, and we’ve successfully reduced the redundancy!

# Conclusion
I hope this article has shed light on how powerful and versatile descriptors can be in Python. From simplifying repetitive tasks to revealing some of the language’s hidden magic, descriptors offer a lot of flexibility for managing attribute access. By understanding how they work, you’ll be better equipped to harness their potential in your future Python projects.

Till next time!

# References
1. [Python's Glossary - Descriptor](https://docs.python.org/3/glossary.html#term-descriptor)
2. [Fluent Python, 2nd Edition Chapter 23](https://www.oreilly.com/library/view/fluent-python-2nd/9781492056348/)
3. [Python Descriptors: An Introduction](https://realpython.com/python-descriptors/)
4. [Descriptor HowTo Guide](https://docs.python.org/3.8/howto/descriptor.html)
5. [Descriptor Guide](https://docs.python.org/3/howto/descriptor.html)
