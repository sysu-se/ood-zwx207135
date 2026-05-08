# EVOLUTION

## 1. Hint 是如何实现的

Hint 不是临时写在 UI 里的逻辑，而是由领域对象提供能力，再由 Svelte 适配层暴露给界面使用。

`Sudoku` 提供棋盘层面的提示计算方法：

- `getCandidates(row, col)` 返回某个格子在行、列、宫约束下所有合法候选数。
- `getCandidateHint(row, col)` 返回指定格子的候选数、位置和原因说明。
- `getNextStepHint()` 扫描当前棋盘，寻找第一个只有一个合法候选数的格子。

`Game` 提供对应的查询方法，并把“查看提示”和“直接应用提示”分开处理。Svelte UI 通过 `src/node_modules/@sudoku/stores/history.js` 中的 store adapter 调用领域对象：普通 Hint 按钮只会在 `hintState` 中记录一个不修改棋盘的候选提示，Next 按钮只会记录一个不修改棋盘的下一步提示，而 `applyHint()` 保留为显式的直接填写行为。

Hint 被设计成多等级提示：Level 1 只高亮位置并显示原因；Level 2 显示候选数；Level 3 在存在唯一候选数时显示可以推出的值。ActionBar 的状态区域会展示当前提示信息，让玩家能看到提示理由。adapter 会根据棋盘签名、提示类型、目标格和候选数为提示生成 key，因此在棋盘未变化时重复查看同一个已显示提示，只会提升 reveal 等级，不会重复消耗 hint 次数。

## 2. Hint 应该属于 Sudoku 还是 Game

Hint 的计算主要属于 `Sudoku`，因为候选数是某个棋盘位置本身的事实。计算候选数时不需要知道 undo 栈、UI 状态，也不需要知道玩家当前是否处在普通模式。

Hint 的使用则属于 `Game`，因为应用提示会改变当前游戏会话。如果一个提示最终填写了某个格子，它应该像玩家手动 guess 一样进入历史记录，并且应该遵守当前模式，例如 Explore Mode。

因此最终设计是协作式的：

- `Sudoku` 负责计算候选数和下一步提示。
- `Game` 负责决定提示如何影响会话状态和历史记录。
- Svelte adapter 负责向 UI 暴露安全的方法。

## 3. Explore Mode 是如何实现的

Explore Mode 被实现为 `Game` 内部的一种新状态。

`Game` 为探索模式维护这些字段：

- `mode`：当前是 `normal` 还是 `explore`。
- `exploreBaseSudoku`：进入探索模式时的棋盘快照。
- `exploreUndoStack` 和 `exploreRedoStack`：探索模式内临时使用的历史记录。
- `failedExplorations`：已经失败的棋盘签名集合。
- `exploreBranches`：轻量级分支记录，包含分支 id、起点签名、移动记录、失败签名和状态。

调用 `enterExplore()` 时，游戏会切换到探索模式，并把当前棋盘 clone 为探索起点。探索过程中，`guess()`、`undo()` 和 `redo()` 使用探索模式自己的 undo/redo 栈，而不是主历史栈。UI 会用蓝色标记相对于探索起点发生变化的格子；当当前探索路径到达一个已记录失败的棋盘签名时，界面会显示失败提示。

调用 `commitExplore()` 会接受探索后的棋盘，把它作为新的主棋盘。调用 `abandonExplore()` 会恢复到探索起点的 clone，不改变主历史记录。

## 4. 主棋盘和探索棋盘的关系

主棋盘和探索棋盘是复制出来的对象，而不是共享同一个可变对象。

进入探索模式时，`Game` 会保存 `exploreBaseSudoku = currentSudoku.clone()`。之后玩家在探索模式中编辑的是 `currentSudoku`。因为 `Sudoku.clone()` 和 `getGrid()` 都会深拷贝棋盘，所以探索过程中的落子不会污染探索起点快照，也不会污染旧的历史记录。

Commit 和 abandon 的处理不同：

- Commit 会把探索起点推入主 undo 栈，把探索后的棋盘设为新的主棋盘，清空主 redo 栈，然后退出探索模式。
- Abandon 会用 `exploreBaseSudoku.clone()` 替换当前棋盘，然后退出探索模式，不向主历史记录中推入新步骤。

这样可以避免引用污染，并让回滚行为保持可预测。

## 5. History 是如何变化的

原来的实现只有一个线性的 undo 栈和一个线性的 redo 栈。

本次扩展保留了这套主线性历史，同时在探索模式中增加了第二套临时线性历史：

- 普通模式使用 `undoStack` 和 `redoStack`。
- Explore Mode 使用 `exploreUndoStack` 和 `exploreRedoStack`。

分支支持没有取代原有栈结构，而是作为 metadata 添加进去。进入 Explore 时会创建第一条路径；如果玩家在 Explore 中通过 `undo()` 回退，然后选择另一个候选数继续尝试，`Game` 会从当前棋盘签名处创建一个子分支。后续 guess 会把 move 签名追加到当前活跃分支中；commit 和 abandon 会把分支标记为 `committed` 或 `abandoned`；失败棋盘签名会记录到到达该局面的分支上。这样，branch 表达的是真正的不同试探路径，而不是“打开 Explore 的次数”。

这里没有引入完整的 DAG 合并语义。探索被视为一个临时分支：如果用户 commit，整个探索分支会折叠成主历史中的一步；如果用户 abandon，分支不会影响当前主棋盘，但分支 metadata 会被保留下来。

这种设计让模型保持简单，同时仍然支持探索过程中的独立 undo 和 redo。

## 6. 本次扩展暴露出的上一阶段局限

上一阶段对简单 guess 和 undo/redo 已经足够，但加入 Hint 和 Explore Mode 后暴露了几个限制。

第一，只有 `currentSudoku`、`undoStack` 和 `redoStack` 的 `Game` 没有位置表达模式。Explore Mode 需要一种会话状态，它不能只是另一次普通落子。

第二，UI 直接修改 `userGrid` 会绕过领域对象。如果界面直接写二维数组，`Game` 就无法记录历史、保护固定格，也无法记住失败的探索路径。源项目中的 `DESIGN.md` 反馈也指出了这个问题，因此现在 UI 事件会统一经过 Svelte store adapter 再进入领域层。

第三，`Sudoku` 需要更丰富的棋盘查询能力。上一阶段只需要编辑和序列化，但 Hint 和 Explore 需要候选数、冲突、完成状态、失败状态、稳定棋盘签名，以及明确的 `isLegalMove()` 查询。这样 UI 既可以允许探索模式中的冲突输入，领域层也可以回答某一步是否符合数独规则。

## 7. 如果重新设计上一阶段，我会怎么改

如果重新设计上一阶段，我会从一开始就把领域边界设计得更严格。

`Sudoku` 仍然负责棋盘规则、固定格、clone 和序列化，但会更早加入候选数、冲突等查询方法。`Game` 会被设计成唯一能改变会话状态的对象，因此 guess、hint、undo、redo 以及之后的 explore 都会经过同一条路径。

对 Svelte 应用来说，我会在上一阶段就引入 store adapter，而不是后面再补。组件只消费 `userGrid`、`historyState` 和 adapter 方法，而 `Game` 与 `Sudoku` 保持为普通 JavaScript 领域对象。这样既能让 UI 响应式状态保持清晰，也不会暴露领域对象的可变内部状态。

## 8. 已完成的可选扩展

1. 树状 Explore 分支

   已在 `Game` 中实现为轻量级 branch metadata，而不是完整的 DAG 合并引擎。当玩家在 Explore 中回退后选择另一条候选路径时，会创建新分支。每个分支记录自己的 id、父分支、起点签名、移动记录、失败签名和状态。

2. 独立的 Explore Undo / Redo

   已通过探索模式专用的 undo/redo 栈实现。普通模式和 Explore Mode 使用不同的线性历史，因此探索过程中的试探可以独立撤销和重做，不会影响主历史。

3. Hint 解释

   多等级 Hint 包含 `reason` 和 `message` 文本。Level 1 高亮目标格并显示解释；Level 2 显示候选数；Level 3 在存在唯一候选数时显示可推出的值。

4. 更完整的 Explore 状态建模

   `getExploreState()` 会暴露 `branchId`、`branchCount`、`activeBranch`、`branches`、`hasFailedCurrentPath` 和 `failedCount`，因此 UI 可以区分不同 fork 路径和已经失败的棋盘状态。

5. 更完整的测试

   测试覆盖了 contract、Sudoku 基础行为、clone、undo/redo、序列化、hint 行为和 explore 行为，也覆盖了多等级提示和 branch 序列化。

6. AI Agent 使用

   实现和 review 过程中使用了 AI agents 进行代码库检查和设计验证，并把这些发现转化为了具体的领域层改动、UI 接线、文档和测试。
