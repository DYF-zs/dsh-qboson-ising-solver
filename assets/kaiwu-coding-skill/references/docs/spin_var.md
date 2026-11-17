# QUBO转Ising时增加一个变量的解释

并非所有专用量子计算机 (SPQC) 都设计用于解决包含线性项的伊辛问题。为了解决这个限制，我们引入一个辅助自旋变量 $s_a$，并将问题重新表述为：

$$
\min_{s_a,s_1,s_2,...s_N} -\sum_{i=1}^N h_{i}s_{i}s_a - \sum_{i \neq j}J_{ij}s_{i}s_{j},
$$

这种重新表述消除了线性项，使其适合于不支持偏置项的 SPQC。这导致的辅助伊辛问题有两个简并解：$[\{\hat{s_{i}}\}_{i=1}^N, \hat{s}_{a} = 1]$ 和 $[\{-\hat{s_{i}}\}_{i=1}^N, \hat{s}_{a} = -1]$。其中，$\{\hat{s_{i}}\}_{i=1}^N$ 表示原始伊辛问题的解。因此，我们可以从辅助问题的解中获得原始问题的解。

**证明**

我们要解决的伊辛问题是：

$$
J(\mathbf{\hat{s}}) = \min_{\mathbf{s}\in \{-1,1\}^N} -\mathbf{h}^T\mathbf{s} - \mathbf{s}^T\mathbf{J}\mathbf{s},
$$

其中 $\mathbf{\hat{s}}$ 是最优解。辅助伊辛问题定义为：

$$
J_a(\mathbf{\bar{s}},\hat{s}_a) = \min_{\mathbf{s}\in \{-1,1\}^N\text{,~}s_a\in\{-1,1\}} -(\mathbf{h}^T\mathbf{s})s_a - \mathbf{s}^T\mathbf{J}\mathbf{s},
$$

其中 $(\mathbf{\bar{s}},\hat{s}_a)$ 表示辅助伊辛问题的最优解。$\mathbf{\bar{s}}$ 和 $\mathbf{\hat{s}}$ 都是 $N\times1$ 自旋向量。如果 $\hat{s_{a}} = 1$，则 $J_a(\mathbf{\bar{s}},1)$ = $J(\mathbf{\hat{s}})$。下面我们证明 $\hat{s_{a}} = -1$ 时, $J_a(\mathbf{\bar{s}},-1) = J(\mathbf{\hat{s}})$。假设相反的情况：

1. 如果 $J_a(\mathbf{\bar{s}},-1) < J(\mathbf{\hat{s}})$，则 $J(-\mathbf{\bar{s}}) < J(\mathbf{\hat{s}})$，这与 $\mathbf{\hat{s}}$ 的最优性相矛盾。
2. 如果 $J_a(\mathbf{\bar{s}},-1) > J(\mathbf{\hat{s}})$，则 $J_a(\mathbf{\bar{s}},-1) > J_a(-\mathbf{\hat{s}},-1)$，这与 $(\mathbf{\bar{s}},-1)$ 在辅助问题中的最优性相矛盾。

因此，$J_a(\mathbf{\bar{s}},\hat{s}_a)$ = $J(\mathbf{\hat{s}})$。注意，辅助伊辛问题有两个简并解 $(\mathbf{\bar{s}},1)$ 和 $(-\mathbf{\bar{s}},-1)$，其中 $\mathbf{\bar{s}}$ 也是原始伊辛问题的最优解。因此，我们可以从辅助问题的解, 通过 $\mathbf{\hat{s}} = \mathbf{\bar{s}} \cdot \hat{s_{a}}$ 得到原始问题的解。
