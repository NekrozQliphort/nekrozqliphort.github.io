A release sequence headed by a release operation A on an atomic object M is a maximal contiguous subsequence of side effects in the modification order of M, where the first operation is A, and every subsequent operation is an atomic read-modify-write operation.

An evaluation A happens before an evaluation B (or, equivalently, B happens after A) if either
(7.1) — A is sequenced before B, or
(7.2) — A synchronizes with B, or
(7.3) — A happens before X and X happens before B.

An evaluation A strongly happens before an evaluation D if, either
(8.1) — A is sequenced before D, or
(8.2) — A synchronizes with D, and both A and D are sequentially consistent atomic operations (32.5.4), or
(8.3) — there are evaluations B and C such that A is sequenced before B, B happens before C, and C is
sequenced before D, or
(8.4) — there is an evaluation B such that A strongly happens before B, and B strongly happens before D.

A visible side effect A on a scalar object or bit-field M with respect to a value computation B of M satisfies
the conditions:
(9.1) — A happens before B and
(9.2) — there is no other side effect X to M such that A happens before X and X happens before B.
The value of a non-atomic scalar object or bit-field M, as determined by evaluation B, is the value stored by
the visible side effect A.

> https://cplusplus.github.io/CWG/issues/740.html

The value of an atomic object M, as determined by evaluation B, is the value stored by some unspecified
side effect A that modifies M, where B does not happen before A


