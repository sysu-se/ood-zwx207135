import { describe, expect, it } from 'vitest'
import { loadDomainApi, makePuzzle } from './helpers/domain-api.js'

describe('HW2 hint behavior', () => {
  it('candidate hints do not mutate the sudoku grid', async () => {
    const { createSudoku } = await loadDomainApi()
    const sudoku = createSudoku(makePuzzle())
    const before = sudoku.getGrid()

    const hint = sudoku.getCandidateHint(0, 2)

    expect(hint.type).toBe('candidates')
    expect(hint.row).toBe(0)
    expect(hint.col).toBe(2)
    expect(hint.candidates).toContain(4)
    expect(typeof hint.reason).toBe('string')
    expect(sudoku.getGrid()).toEqual(before)
  })

  it('supports multi-level candidate hints', async () => {
    const { createSudoku } = await loadDomainApi()
    const sudoku = createSudoku(makePuzzle())

    const level1 = sudoku.getCandidateHint(0, 2, 1)
    const level2 = sudoku.getCandidateHint(0, 2, 2)
    const level3 = sudoku.getCandidateHint(0, 2, 3)

    expect(level1).toMatchObject({ type: 'candidates', row: 0, col: 2, level: 1, maxLevel: 3 })
    expect(level1.candidates).toBeUndefined()
    expect(level1.value).toBeUndefined()
    expect(level2.candidates).toContain(4)
    expect(level2.value).toBeUndefined()
    expect(level3.candidates).toContain(4)
    expect(level3.value).toBeUndefined()
  })

  it('next-step hints choose a cell with a directly inferred single candidate', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const puzzle = makePuzzle()
    puzzle[0][2] = 4
    puzzle[0][3] = 6
    puzzle[0][5] = 8
    puzzle[0][6] = 9
    puzzle[0][7] = 1
    const game = createGame({ sudoku: createSudoku(puzzle) })
    const before = game.getGrid()

    const hint = game.getNextStepHint()

    expect(hint).toMatchObject({ type: 'next-step', row: 0, col: 8, value: 2, candidates: [2] })
    expect(hint.candidates).toHaveLength(1)
    expect(game.getGrid()).toEqual(before)
    expect(game.canUndo()).toBe(false)
  })

  it('supports multi-level next-step hints', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const puzzle = makePuzzle()
    puzzle[0][2] = 4
    puzzle[0][3] = 6
    puzzle[0][5] = 8
    puzzle[0][6] = 9
    puzzle[0][7] = 1
    const game = createGame({ sudoku: createSudoku(puzzle) })

    const level1 = game.getNextStepHint(1)
    const level2 = game.getNextStepHint(2)
    const level3 = game.getNextStepHint(3)

    expect(level1).toMatchObject({ type: 'next-step', row: 0, col: 8, level: 1 })
    expect(level1.candidates).toBeUndefined()
    expect(level1.value).toBeUndefined()
    expect(level2.candidates).toEqual([2])
    expect(level2.value).toBeUndefined()
    expect(level3.candidates).toEqual([2])
    expect(level3.value).toBe(2)
  })

  it('applyHint only fills selected cells with a single candidate', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    const ambiguous = game.applyHint({ row: 0, col: 2 })
    expect(ambiguous).toBe(null)
    expect(game.getGrid()[0][2]).toBe(0)

    const puzzle = makePuzzle()
    puzzle[0][2] = 4
    puzzle[0][3] = 6
    puzzle[0][5] = 8
    puzzle[0][6] = 9
    puzzle[0][7] = 1
    const single = createGame({ sudoku: createSudoku(puzzle) })

    const applied = single.applyHint({ row: 0, col: 8 })
    expect(applied).toMatchObject({ row: 0, col: 8, value: 2 })
    expect(single.getGrid()[0][8]).toBe(2)
    expect(single.canUndo()).toBe(true)
  })
})
