---
title: "Grind For Yellow - Counting with Equations?"
date: 2024-07-09 10:10:00 +0800
categories: [Grind For Yellow, Atcoder]
tags: [grind-for-yellow, dsa, atcoder]
media_subpath: "/assets/img/posts_img/2024-07-09-counting-with-eqns/"
math: true
comments: true    # TAG names should always be lowercase
---

> **Solved**: ✅  
**Difficulty**: ★★★☆☆☆   
**Uniqueness**: ★★★★★☆
{: .prompt-info }

# Problem Statement

For those willing to give the problem a try, [here](https://atcoder.jp/contests/typical90/tasks/typical90_be) is the problem. For those that require a translation, here's the gist of it:

<blockquote>
There are $M$ panels numbered from $1$ to $M$, initially faced down, and $N$ switches numbered from $1$ to $N$. The $k$-th switch  flips a specified set of $T_k$ panels, given as $A_{k,1}, A_{k,2}, ... , A_{k,T_k}$-th panels. We are also given a final configuration of the panels, where $S_i = 0$ means the $i$-th panel is faced-down, and $S_i = 1$ means it is faced-up.

<br><br> 
Out of all $2^N$ possible combinations to flip the switches, count the number of ways (modulo $998244353$) such that the panels match the given final configuration.
</blockquote>

# Intuition
Initially, it was not clear how we should approach this problem. One way I initially tried to tackle this problem is through a graph, but to no avail.

![Panel Switches Graph](panel-switch-light.png){: .light }
![Panel Switches Graph](panel-switch-dark.png){: .dark }
_Graph of Panel Switches Relationship_

Let's simplify the question a bit and determine whether a solution exists. For each panel $i$, we know which switches $k$ affect it. We can thus set up an equation,
$$
\begin{equation}
  \sum_{k \in F_{i}} x_k\ (mod\ 2) = S_i, 
  \label{eq:panel-eqn}
\end{equation}
$$
where $k\in F_{i}$ if the $k$-th switch affects the $i$-th panel.

Note that if we set up \eqref{eq:panel-eqn} for all panels, we know a solution exist if the set of equations is solvable. Now, can we generalise this approach for the counting problem?

# Solution
Setting up all equations, we get something like the following:
$$
\begin{equation}
  Ax = S, 
  \label{eq:full-panel-eqn}
\end{equation}
$$

The key is to notice the number of solutions possible is $2^k$ where $k$ is the number of free variables (provided that the system is feasible), or in other words, the $nullity(A)$. We can first find the rank of matrix $A$ simply by perfoming Gaussian Elimination to convert $A$ to its row-echelon form (REF), counting the number of nonzero rows in the resulting matrix . Finally, using the rank-nullity theorem, we obtain the nullity of the matrix by subtracting $rank(A)$ from the number of columns, $N$.

> We can perform Gaussian Elimination here since $\mathbb{Z}$ mod 2 is a field.
{: .prompt-info }

# Code
```c++
#include <iostream>
#include <vector>
using namespace std;

int N, M;
vector<vector<int>> mat;

int main() {
    cin.tie(nullptr); ios_base::sync_with_stdio(0); // Fast IO
    cin >> N >> M; mat.assign(M, vector<int>(N+1, 0));
    for (int r = 0, t, idx; r < N; r++) {
        for (cin >> t; t--; ) {
            cin >> idx; idx--;
            // idx-th panel affected by r-th switch
            mat[idx][r] = 1;
        }
    }
    
    for (int i = 0; i < M; i++) cin >> mat[i][N];

    // Calculate REF
    int done = 0;
    for (int col = 0; col < N+1; col++) {
        bool ok = 0;
        for (int row = done; row < M && !ok; row++) {
            if (mat[row][col] == 1) { swap(mat[row], mat[done]); ok = 1; }
        }

        if (!ok) continue;
        else if (col == N) { cout << "0\n"; return 0; } // Not feasible

        for (int row = done+1; row < M; row++) {
            if (mat[row][col] == 0) continue;
            for (int k = col; k < N+1; k++) mat[row][k] ^= mat[done][k];
        }
        done++;
    }

    // Binary exponentiation
    constexpr int MOD = 998244353;
    int pow = N - done; long long res = 1;
    for (long long a = 2; pow > 0; pow >>= 1) {
        if (pow & 1) res = (res * a) % MOD;
        a = (a * a) % MOD;
    }
    cout << res << '\n';
}
```

# Takeaway
One effective approach to problem-solving involves setting up equations and deriving insights from them. While the equations themselves may not always directly lead to the final solution, they often provide valuable observations and insights along the way.

Till next time!
