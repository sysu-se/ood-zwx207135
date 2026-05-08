import { describe, expect, it } from 'vitest'
import { loadDomainApi, makePuzzle } from './helpers/domain-api.js'

describe('HW2 explore behavior', () => {
  it('tracks cells changed during explore mode', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    expect(game.getExploreCells()).toEqual([])

    game.enterExplore()
    game.guess({ row: 0, col: 2, value: 4 })
    game.guess({ row: 1, col: 1, value: 7 })

    expect(game.getExploreCells()).toEqual([
      { row: 0, col: 2 },
      { row: 1, col: 1 },
    ])
    expect(game.getViewState().exploreCells).toEqual(game.getExploreCells())

    game.abandonExplore()
    expect(game.getExploreCells()).toEqual([])
    expect(game.getGrid()[0][2]).toBe(0)
  })

  it('creates branch records when exploration forks after backtracking', async () => {
    const { createGame, createGameFromJSON, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.enterExplore()
    expect(game.getExploreState().branchId).toBe('branch-1')

    game.guess({ row: 0, col: 2, value: 4 })
    game.guess({ row: 1, col: 1, value: 7 })
    expect(game.getExploreBranches()).toHaveLength(1)

    game.undo()
    game.guess({ row: 1, col: 1, value: 8 })

    const branches = game.getExploreBranches()
    expect(branches).toHaveLength(2)
    expect(branches[0]).toMatchObject({ id: 'branch-1', parentId: null, status: 'active' })
    expect(branches[1].id).toBe('branch-2')
    expect(branches[1].parentId).toBe('branch-1')
    expect(branches[1].moves).toHaveLength(1)
    expect(branches[1].moves[0]).toMatchObject({ row: 1, col: 1, value: 8 })

    game.abandonExplore()
    expect(game.getExploreBranches()[1].status).toBe('abandoned')

    const restored = createGameFromJSON(JSON.parse(JSON.stringify(game.toJSON())))
    expect(restored.getExploreBranches()).toEqual(game.getExploreBranches())
  })

  it('records failed exploration boards for later recognition', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.enterExplore()
    game.guess({ row: 0, col: 2, value: 5 })

    expect(game.hasFailedCurrentPath()).toBe(true)
    expect(game.getFailedExplorations()).toHaveLength(1)
    expect(game.getActiveExploreBranch().status).toBe('failed')
    expect(game.getActiveExploreBranch().failedSignatures).toContain(game.getSudoku().getSignature())
  })
})
