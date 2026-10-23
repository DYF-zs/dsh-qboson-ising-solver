==============
高阶问题求解
==============


1. 高阶优化
============

QUBO（Quadratic Unconstrained Binary Optimization）二次无约束二元优化的目的是求得一组布尔变量的值  :math:`(x_0,x_1…x_n)`  ，
使得二阶多项式  :math:`x^T Qx`  的值最小。

而HOBO（Higher Order Binary Optimization）高阶二元优化可以通过添加约束条件转化为QUBO问题，具体来说，即通过变量替换，令  :math:`y=x_0 x_1`  ，
将原式中的单项式阶数降低，并添加  :math:`y=x_0 x_1`  的约束。

而要使得约束成立的方式是在原式中添加惩罚项，即Rosenberg二次惩罚项，  :math:`p(x_0,x_1,y)=x_0 x_1-2x_0 y-2x_1 y+3y` 。
该惩罚项满足  :math:`y=x_0x_1 \to p(x_0, x_1,y)=0, y\neq x_0 x_1 \to p(x_0, x_1, y) > 0`  

最终新的多项式为  :math:`f(x,y)+k \sum p(x_i,x_j,y_{ij})`  ，其中k是惩罚项系数

2. 使用举例
=================

(1) 降阶
-------------------

```python
import kaiwu as kw

x = kw.core.ndarray(10, "x", kw.core.Binary)
y1 = x[0] * x[1] + x[2] * x[3] + x[8]
y2 = x[3] * x[4] + x[5]
y3 = y1 * y2
print(y3, "\n")
hobo_model = kw.hobo.HoboModel(y3)
qubo_model = hobo_model.reduce()
print(hobo_model, "\n")
print(qubo_model)
```

执行以上代码后结果为

.. code::

  Minimize x[2]*x[3]*x[5]+x[2]*x[3]*x[4]+x[0]*x[1]*x[5]+x[0]*x[1]*x[3]*x[4]+x[5]*x[8]+x[3]*x[4]*x[8]
  Subject to (hobo constraints):
  _x[2]_x[3] := x[2] * x[3]
  _x[0]_x[1] := x[0] * x[1]
  _x[3]_x[4] := x[3] * x[4] 

  Minimize _x[2]_x[3]*x[5]+_x[2]_x[3]*x[4]+_x[0]_x[1]*x[5]+_x[0]_x[1]*_x[3]_x[4]+x[5]*x[8]+_x[3]_x[4]*x[8]
  Subject to (hard constraints):
  x[2]*x[3]-2*_x[2]_x[3]*x[2]-2*_x[2]_x[3]*x[3]+3*_x[2]_x[3]
  x[0]*x[1]-2*_x[0]_x[1]*x[0]-2*_x[0]_x[1]*x[1]+3*_x[0]_x[1]
  x[3]*x[4]-2*_x[3]_x[4]*x[3]-2*_x[3]_x[4]*x[4]+3*_x[3]_x[4]


(2) 检查求得的结果是否满足降阶约束条件
---------------------------------------

```python
import kaiwu as kw

x1, x2, x3 = kw.core.Binary("x1"), kw.core.Binary("x2"), kw.core.Binary("x3")
p = x1 * x2 * x3
hobo_model = kw.hobo.HoboModel(p)
qubo_model = hobo_model.reduce()
solution = {"x1": 1, "x2": 1, "x3": 0, "_x1_x2": 1}
err_cnt, _ = hobo_model.verify_hobo_constraint(solution)
print(err_cnt)  # 输出0，证明解满足降阶的约束
```
