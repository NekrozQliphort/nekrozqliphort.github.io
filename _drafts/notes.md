Something important to note is that an objects lifetime is not tied to the existence of such an object. An object still exists even if it's lifetime ended, unless destroyed by using delete-expressions, as mentioned in [[intro.object]/1](https://timsong-cpp.github.io/cppwp/n4950/intro.object#1).

To convince you further that this is the case, note [\[basic.compound\]/3](https://timsong-cpp.github.io/cppwp/n4950/basic.compound#3) and [\[basic.stc.general\]/4](https://timsong-cpp.github.io/cppwp/n4950/basic.stc#general-4) :
> Every value of pointer type is one of the following:  
> - a pointer to an object or function (the pointer is said to point to the object or function), or
> - a pointer past the end of an object, or
> - the null pointer value for that type, or
> - an invalid pointer value.

> When the end of the duration of a region of storage is reached, the values of all pointers representing the
address of any part of that region of storage become invalid pointer values. Indirection through an
invalid pointer value and passing an invalid pointer value to a deallocation function have undefined behavior.
Any other use of an invalid pointer value has implementation-defined behavior.

As an example:
struct Foo {};

int main() {
    Foo* f = new Foo();
    f->~Foo();
    // f must still be pointing to a Foo object here
}Here, f must still be pointing a Foo object after the destructor call, otherwise it would have violated the rules above. Why is this important? This is important because it means the pointer p can still point to the elements of the array of std::byte