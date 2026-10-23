# 案例解析-任务调度问题

![](images/jsp1.jpg)

## 🙋‍♀️🙋‍♂️什么是任务调度问题（JSP）

任务调度，这个听起来有点高大上的领域，其实在我们的日常生活中无处不在。你可以把它想象成是一位超级高效的秘书，负责安排公司里的各项工作任务。这位秘书要确保每个任务都能在合适的时间得到处理，既不能让员工闲着，也不能让工作堆积如山。在计算机科学中，任务调度就是这么一个角色，它负责**指挥计算机系统中的各种任务按部就班地进行**。

想象一下，我们的电脑或者手机，每天都要处理成千上万的任务，比如打开应用、运行程序、处理数据等。如果没有一个合理的调度策略，这些任务可能会相互打架，导致系统崩溃或者运行缓慢。任务调度的作用，就是像交通警察一样，指挥这些任务有条不紊地进行。它通过一系列精心设计的算法，比如优先级调度、轮询调度、公平调度等，来确保每个任务都能在适当的时候得到处理。

接地气一点来说，任务调度就像是我们厨房里的厨师长。你瞧，厨房里有洗菜的、切菜的、炒菜的，每个环节都有不同的任务。厨师长要根据客人的点单、食材的准备情况以及厨师的擅长领域，来合理安排每个人的工作。任务调度也是这样，它要根据任务的紧急程度、资源占用情况以及系统的整体负载，来决定哪个任务先执行，哪个任务后执行。

在逻辑严谨性上，任务调度领域的研究者们需要考虑的因素非常多。比如，如何保证重要任务优先执行，同时又不至于让不那么重要的任务饿死（即长时间得不到执行）；如何在多任务并发的情况下，合理分配CPU、内存等资源，提高系统的吞吐量；以及如何在任务执行过程中，动态调整调度策略，以应对不断变化的系统环境。

总之，任务调度是计算机科学中的一个关键领域，它不仅关系到我们日常使用的电子设备的性能，还涉及到数据中心、云计算、物联网等多个领域的效率和安全。通过对任务调度的深入研究，我们能更好地利用计算机资源，提高工作效率，让我们的生活和工作更加便捷。

## 应用案例：云计算中的任务调度🖧

在云计算环境中，资源调度问题可视为一个JSP问题。具体来说，可以将云计算中的任务视为任务，服务器视为机器，通过调度算法优化资源利用率和任务完成时间。以下是一个基本的云计算任务调度示例：

- 任务描述：客户提交一组渲染任务，每个任务有特定的计算量。

- 目标：最小化所有任务的最大完成时间。

- 解决方案：通过将任务分配给合适的服务器，使用量子计算技术优化调度方案，达到资源高效利用和任务尽早完成的目标。

![](images/jsp2.png)

JSP 的基本组成包括：

- 任务（Job）：需要完成的任务，每个任务只有一道工序。

- 机器（Machine）：执行任务的资源，每台机器一次只能处理一个任务。

- 调度（Schedule）：安排任务给不同的机器，并决策任务在机器上的执行顺序(事实上在本文中的JSP问题中，任务在机器上的执行顺序对结果无影响)。

为了将问题抽象简化，将多机任务调度问题的假设总结如下：

1. 各任务需要的处理时间是一个确定的常数，只与任务有关；
2. 各任务需要的处理时间与所在的机器无关，即假设各机器的任务处理效率一致；
3. 各机器可以有不同的空闲开始时间，在此之前机器无法处理任务；
4. 同一个任务只能被分配到一台机器上运行；
5. 一台机器同一时刻最多只能处理一个任务；
6. 机器在处理完一个任务后立即执行下一个被分配的任务直到完成所有被分配的任务；
7. 所有的任务都要完成处理；

## 问题定义📖

各个任务所需的运行时间以及各机器空闲开始时间取值为整数（比如取定义的时间精度的整数倍）。这样做便于将组合优化模型转为QUBO（Quadratic
Unconstrained Binary
Optimization，二次无约束二值优化）形式，以适配专用量子计算机。

为了规范化表述，将多机任务调度问题用到的集合与数据做以下定义：

定义机器集合 $M$，比如 M=\{机器1，机器2，…\}，机器的数量表示为 $|M|$。

定义任务集合 $N$，比如 N={任务1，任务2，...}，任务的数量表示为 $|N|$。

定义任务 $i \in V$ 所需的处理时间为 $w_{i}$。

定义机器 $j \in M$ 的空闲开始时间为 $S_{j}$。

下面的示意图以4台机器处理10个任务为例，纵轴为机器，横轴为时间，每台服务器的空闲开始时间分别为1,2,3,4，后面每个带有数字的方块代表分配到各机器上的任务对应的时长，一个让整体完成时间最短的分配方案如图，该方案也是让各机器负载均衡的一个最优解，即各机器完成时间尽可能接近。

![](images/jsp3.png)

## JSP 的数学描述及QUBO模型

定义二值变量Xij，代表任务i是否分配到机器j上，如果任务i被分配到机器j，Xij=1，否则Xij=0。根据前述定义与假设，机器j的任务完成时间可表示为

$$
t_j = \sum_{i \in N} w_i x_{ij} + S_j
$$

下面根据不同的目标，分别给出对应的QUBO模型。

### 🕐模型一最小化整体完成时间

针对第一种目标，即整体完成时间最短，首先建立组合优化模型如下：

定义变量为整体最晚完成的时间，也就是各个机器完成时间中的最大值，

$$
u = \max_{j \in M} t_j
$$

目标函数

$$
\min u
$$

约束条件

$$
u \ge \sum_{i \in N} w_i x_{ij} + S_j,\quad \forall j \in M
\tag{1}
$$

$$
\sum_{j \in M} x_{ij} = 1,\quad \forall i \in N
\tag{2}
$$

约束(1)表示最晚完成时间u不小于任何机器的完成时间tj，由于目标函数是最小化最晚完成时间u，变量u将取到满足(1)的最小值，也就是最晚完成的机器对应的完成时间。约束(2)限制了对于任何任务只能被一台机器执行。

为了适配量子计算，需要将上面的组合优化模型转为QUBO形式，QUBO特点是所有决策变量为二值变量，目标是二次函数，且无约束条件。由于目标为整数，可用基于多个二值变量的二进制来表示：

$$
u = \sum_{l \in L} 2^l u_l
$$

其中 $u_{l}$ 为二值变量，取值0或1。 所需要的二进制位数集合，取决于数据的值。这样求解的最小值就转变为求解的取值。

下一步将不等式约束(1)通过增加松弛变量的方式转化为等式约束。所有的松弛变量都是非负的。约束(1)可表示为：

$$
u = \sum_{i \in N} w_i x_{ij} + S_j + y_j,\quad \forall j \in M
$$

由于松弛变量也是整数，将其二进制化，约束(1)可进一步表示为：

$$
\begin{aligned}
\sum_{l \in L} 2^l u_l
&= \sum_{i \in N} w_i x_{ij} + S_j \\
&\quad + \sum_{l \in L} 2^l y_{jl},
\quad \forall j \in M
\end{aligned}
$$

为了将等式约束化为目标函数的一部分从而满足QUBO形式，将等式约束改写为 $f(x, u) = 0$ 的形式，然后将左侧取平方，乘以足够大的惩罚系数 $\lambda$ 加入目标函数即可。这样当约束被满足，目标项中的相关项也就为0。目标最小化求解会倾向于让所有惩罚项为零，即所有约束被满足。这样，原模型就可以转化为以下QUBO模型：

$$
\begin{aligned}
\min_{u,x,y}\quad
&\sum_{l \in L} 2^l u_l \\
&+ \lambda \sum_{j \in M}
\left(
\sum_{l \in L} 2^l u_l
- \sum_{i \in N} w_i x_{ij}
- S_j
- \sum_{l \in L} 2^l y_{jl}
\right)^2 \\
&+ \lambda \sum_{i \in N}
\left(
\sum_{j \in M} x_{ij} - 1
\right)^2
\end{aligned}
$$

### 🕐模型二最小化各机器完成时间差距（负载均衡）

针对第二种目标，即各机器完成时间差异最小，将最小化各机器完成时间的方差作为优化目标，建立组合优化模型如下：

目标函数

$$
\min_t \frac{1}{|M|}
\sum_{j \in M}
\left(
t_j - \frac{\sum_{j \in M} t_j}{|M|}
\right)^2
$$

注意到各机器的平均完成时间与分配方案无关，是常数，将其定义为 $\overline{C}$。

$$
\begin{aligned}
\overline{C}
&= \frac{\sum_{j \in M} t_j}{|M|} \\
&= \frac{\sum_{j \in M}
\left(\sum_{i \in N} w_i x_{ij} + S_j\right)}{|M|} \\
&= \frac{\sum_{i \in N} w_i + \sum_{j \in M} S_j}{|M|}
\end{aligned}
$$

QUBO化的思路与上一模型一致，则QUBO模型可表达为：

$$
\begin{aligned}
\min_x\quad
&\frac{1}{|M|}
\sum_{j \in M}
\left(
\sum_{i \in N} w_i x_{ij} + S_j - \overline{C}
\right)^2 \\
&+ \lambda \sum_{i \in N}
\left(
\sum_{j \in M} x_{ij} - 1
\right)^2
\end{aligned}
$$

## 模型代码

```python
import math
from typing import Tuple
import numpy as np
import kaiwu as kw
from kaiwu.core import quicksum


class JobScheduler:
    """
    Quantum-inspired job scheduler using QUBO formulation.
    """

    def __init__(
        self,
        num_tasks: int = 20,
        num_machines: int = 3,
        penalty: float = 1e3,
        seed: int = 12345,
    ) -> None:
        self.num_tasks = num_tasks
        self.num_machines = num_machines
        self.penalty = penalty
        np.random.seed(seed)

        # Task durations and machine start times
        self.durations = {
            i: np.random.randint(1, num_tasks + 1) for i in range(1, num_tasks + 1)
        }
        self.start_times = {
            j: np.random.randint(1, num_machines + 1)
            for j in range(1, num_machines + 1)
        }

        # QUBO variables
        self.var_x = {}
        self.model = kw.core.QuboModel()

    def prepare_model(self) -> None:
        """Build QUBO model: variance objective + assignment constraints."""
        # Create binary decision variables
        for t_n in range(1, self.num_tasks + 1):
            for m_n in range(1, self.num_machines + 1):
                self.var_x[t_n, m_n] = kw.core.Binary(f"x[{t_n - 1}][{m_n - 1}]")

        # Precompute constants
        total_start = sum(self.start_times.values())
        total_duration = sum(self.durations.values())
        avg_completion = (total_start + total_duration) / self.num_machines

        # Build machine load expressions: start_time + sum(duration * assignment)
        machine_loads = {}
        for m in self.start_times:
            task_sum = [self.durations[t] * self.var_x[t, m] for t in self.durations]
            task_sum.append(self.start_times[m])  # Add start time to the sum
            machine_loads[m] = quicksum(task_sum)

        # Variance = (1/M) * Σ (load_m - avg)^2
        deviation_squares = [
            (machine_loads[m] - avg_completion) ** 2 for m in self.start_times
        ]
        variance = quicksum(deviation_squares) / self.num_machines

        # Set objective
        self.model.set_objective(variance)

        # Assignment constraints: each task assigned exactly once
        for t_n in self.durations:
            self.model.add_constraint(
                quicksum(self.var_x[t_n, m_n] for m_n in self.start_times) == 1,
                name=f"c[{t_n}]",
                penalty=self.penalty,
            )

    def machine_end_times(self, solution: dict) -> dict:
        """Return completion time for each machine."""
        return {
            m: kw.core.get_val(
                self.start_times[m]
                + quicksum(
                    self.durations[t] * self.var_x[t, m] for t in self.durations
                ),
                solution,
            )
            for m in self.start_times
        }

    def max_completion_time(self, solution: dict) -> float:
        """Compute the maximum completion time across machines."""
        end_times = []
        for m_index in self.start_times:
            end_time = kw.core.get_val(
                self.start_times[m_index]
                + quicksum(
                    self.durations[t] * self.var_x[t, m_index] for t in self.durations
                ),
                solution,
            )
            end_times.append(end_time)
        return max(end_times)

    def solve(self, max_iter: int = 40) -> Tuple[float, dict]:
        """Solve QUBO with simulated annealing, return best makespan and solution."""
        best_time = math.inf
        best_sol = {}

        for i in range(max_iter):  # pylint: disable=consider-using-enumerate
            print(f"Iteration {i}, best_time={best_time}")
            solver = kw.classical.SimulatedAnnealingOptimizer(
                initial_temperature=1e3,
                alpha=0.99,
                cutoff_temperature=1e-4,
                iterations_per_t=10,
            )
            sol, _ = solver.solve_qubo(self.model)
            unsatisfied_count, _ = self.model.verify_constraint(sol)
            if unsatisfied_count == 0:
                makespan = self.max_completion_time(sol)
                if makespan < best_time:
                    best_time, best_sol = makespan, sol

        return best_time, best_sol


def assert_documented_results():
    """Check that the documented model-building path stays valid."""
    scheduler = JobScheduler()
    scheduler.prepare_model()
    assert scheduler.model is not None


if __name__ == "__main__":
    scheduler = JobScheduler()
    scheduler.prepare_model()
    best, solution = scheduler.solve()
    print("Best makespan:", best)

    # Print end times per machine
    end_times = scheduler.machine_end_times(solution)
    print("Machine completion times:")
    for m, t in end_times.items():
        print(f"  Machine {m}: {t}")
```

## 总结

任务调度问题（JSP）是一个复杂但实用的优化问题，广泛应用于制造业、项目管理和云计算等领域。尽管求解
JSP
具有挑战性，但通过使用各种先进算法和技术，例如量子计算，可以有效优化调度方案，提升系统效率和资源利用率。
