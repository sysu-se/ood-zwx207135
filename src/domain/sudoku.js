const BOX_SIZE = 3;
const SUDOKU_SIZE = 9;

function cloneGrid(grid) {
	return grid.map((row) => row.slice());
}

function isObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateGrid(grid, label) {
	if (!Array.isArray(grid) || grid.length !== SUDOKU_SIZE) {
		throw new Error(`${label} must be a 9x9 array`);
	}

	for (const row of grid) {
		if (!Array.isArray(row) || row.length !== SUDOKU_SIZE) {
			throw new Error(`${label} must be a 9x9 array`);
		}

		for (const cell of row) {
			if (!Number.isInteger(cell) || cell < 0 || cell > 9) {
				throw new Error(`${label} cells must be integers between 0 and 9`);
			}
		}
	}
}

function normalizePosition(row, col) {
	if (isObject(row)) {
		const position = row;
		row = position.row !== undefined ? position.row : position.y;
		col = position.col !== undefined ? position.col : position.x;
	}

	if (!Number.isInteger(row) || row < 0 || row >= SUDOKU_SIZE) {
		throw new Error('Row must be an integer between 0 and 8');
	}

	if (!Number.isInteger(col) || col < 0 || col >= SUDOKU_SIZE) {
		throw new Error('Col must be an integer between 0 and 8');
	}

	return { row, col };
}

function validateMove(move) {
	if (!isObject(move)) {
		throw new Error('Move must be an object');
	}

	const { row, col } = normalizePosition(move.row !== undefined ? move.row : move.y, move.col !== undefined ? move.col : move.x);
	const { value } = move;

	if (!Number.isInteger(value) || value < 0 || value > 9) {
		throw new Error('Move value must be an integer between 0 and 9');
	}

	return { row, col, value };
}

function hasConflict(grid, row, col, value) {
	for (let index = 0; index < SUDOKU_SIZE; index += 1) {
		if (index !== col && grid[row][index] === value) {
			return true;
		}

		if (index !== row && grid[index][col] === value) {
			return true;
		}
	}

	const startRow = Math.floor(row / BOX_SIZE) * BOX_SIZE;
	const startCol = Math.floor(col / BOX_SIZE) * BOX_SIZE;

	for (let currentRow = startRow; currentRow < startRow + BOX_SIZE; currentRow += 1) {
		for (let currentCol = startCol; currentCol < startCol + BOX_SIZE; currentCol += 1) {
			if ((currentRow !== row || currentCol !== col) && grid[currentRow][currentCol] === value) {
				return true;
			}
		}
	}

	return false;
}

function validateSolvedState(grid, label) {
	for (let row = 0; row < SUDOKU_SIZE; row += 1) {
		for (let col = 0; col < SUDOKU_SIZE; col += 1) {
			const value = grid[row][col];
			if (value !== 0 && hasConflict(grid, row, col, value)) {
				throw new Error(`${label} contains conflicting values`);
			}
		}
	}
}

function addConflict(conflicts, row, col, value) {
	conflicts.set(`${row},${col}`, { row, col, value });
}

function addGroupConflicts(conflicts, cells) {
	const byValue = new Map();

	for (const cell of cells) {
		if (cell.value === 0) {
			continue;
		}

		if (!byValue.has(cell.value)) {
			byValue.set(cell.value, []);
		}

		byValue.get(cell.value).push(cell);
	}

	for (const cellsWithSameValue of byValue.values()) {
		if (cellsWithSameValue.length > 1) {
			for (const cell of cellsWithSameValue) {
				addConflict(conflicts, cell.row, cell.col, cell.value);
			}
		}
	}
}

function findConflicts(grid) {
	const conflicts = new Map();

	for (let row = 0; row < SUDOKU_SIZE; row += 1) {
		const cells = [];
		for (let col = 0; col < SUDOKU_SIZE; col += 1) {
			cells.push({ row, col, value: grid[row][col] });
		}
		addGroupConflicts(conflicts, cells);
	}

	for (let col = 0; col < SUDOKU_SIZE; col += 1) {
		const cells = [];
		for (let row = 0; row < SUDOKU_SIZE; row += 1) {
			cells.push({ row, col, value: grid[row][col] });
		}
		addGroupConflicts(conflicts, cells);
	}

	for (let startRow = 0; startRow < SUDOKU_SIZE; startRow += BOX_SIZE) {
		for (let startCol = 0; startCol < SUDOKU_SIZE; startCol += BOX_SIZE) {
			const cells = [];
			for (let row = startRow; row < startRow + BOX_SIZE; row += 1) {
				for (let col = startCol; col < startCol + BOX_SIZE; col += 1) {
					cells.push({ row, col, value: grid[row][col] });
				}
			}
			addGroupConflicts(conflicts, cells);
		}
	}

	return Array.from(conflicts.values()).sort((left, right) => left.row - right.row || left.col - right.col);
}

function validateJSONState(json) {
	if (!isObject(json)) {
		throw new Error('Sudoku JSON must be an object');
	}

	if (!('givens' in json) || !('grid' in json)) {
		throw new Error('Sudoku JSON must include givens and grid');
	}

	validateGrid(json.givens, 'Sudoku givens');
	validateGrid(json.grid, 'Sudoku grid');
	validateSolvedState(json.givens, 'Sudoku givens');

	for (let row = 0; row < SUDOKU_SIZE; row += 1) {
		for (let col = 0; col < SUDOKU_SIZE; col += 1) {
			const given = json.givens[row][col];
			if (given !== 0 && json.grid[row][col] !== given) {
				throw new Error('Sudoku grid must preserve givens');
			}
		}
	}
}

function createSudokuState({ givens: initialGivens, grid: initialGrid }) {
	const givens = cloneGrid(initialGivens);
	let grid = cloneGrid(initialGrid);

	function getCandidatesAt(row, col) {
		if (grid[row][col] !== 0) {
			return [];
		}

		const candidates = [];

		for (let value = 1; value <= SUDOKU_SIZE; value += 1) {
			if (!hasConflict(grid, row, col, value)) {
				candidates.push(value);
			}
		}

		return candidates;
	}

	function getFailureReason() {
		if (findConflicts(grid).length > 0) {
			return 'conflict';
		}

		for (let row = 0; row < SUDOKU_SIZE; row += 1) {
			for (let col = 0; col < SUDOKU_SIZE; col += 1) {
				if (grid[row][col] === 0 && getCandidatesAt(row, col).length === 0) {
					return 'no-candidates';
				}
			}
		}

		return null;
	}

	function normalizeHintLevel(level) {
		if (!Number.isInteger(level)) {
			return 1;
		}

		return Math.max(1, Math.min(3, level));
	}

	function buildCandidateHint(row, col, candidates, level) {
		const hintLevel = normalizeHintLevel(level);
		const hint = {
			type: 'candidates',
			row,
			col,
			level: hintLevel,
			maxLevel: 3,
			reason: candidates.length === 0 ? 'This cell has no legal candidates' : 'Values that do not conflict with the row, column, or box',
			message: 'This cell is a useful place to inspect.',
		};

		if (hintLevel >= 2) {
			hint.candidates = candidates;
			hint.message = candidates.length === 0
				? 'There are no legal candidates for this cell.'
				: `Possible values: ${candidates.join(', ')}`;
		}

		if (hintLevel >= 3) {
			if (candidates.length === 1) {
				hint.value = candidates[0];
				hint.message = `Only ${candidates[0]} fits this cell.`;
			} else {
				hint.message = candidates.length === 0
					? 'This cell has no legal value in the current board.'
					: 'This cell is not forced yet because multiple candidates remain.';
			}
		}

		return hint;
	}

	function buildNextStepHint(row, col, candidates, level) {
		const hintLevel = normalizeHintLevel(level);
		const hint = {
			type: 'next-step',
			row,
			col,
			level: hintLevel,
			maxLevel: 3,
			reason: 'Only one candidate fits this cell',
			message: 'This cell can be solved directly from the current board.',
		};

		if (hintLevel >= 2) {
			hint.candidates = candidates;
			hint.message = `Candidate set: ${candidates.join(', ')}`;
		}

		if (hintLevel >= 3) {
			hint.candidates = candidates;
			hint.value = candidates[0];
			hint.message = `The next value is ${candidates[0]} because it is the only candidate.`;
		}

		return hint;
	}

	return {
		getGrid() {
			return cloneGrid(grid);
		},

		getGivens() {
			return cloneGrid(givens);
		},

		isGiven(row, col) {
			const position = normalizePosition(row, col);
			return givens[position.row][position.col] !== 0;
		},

		isUserCell(row, col) {
			return !this.isGiven(row, col);
		},

		isLegalMove(move) {
			const { row, col, value } = validateMove(move);

			if (givens[row][col] !== 0) {
				return false;
			}

			return value === 0 || !hasConflict(grid, row, col, value);
		},

		guess(move) {
			const { row, col, value } = validateMove(move);

			if (givens[row][col] !== 0) {
				throw new Error('Cannot change a given cell');
			}

			grid[row][col] = value;
		},

		getCandidates(row, col) {
			const position = normalizePosition(row, col);
			return getCandidatesAt(position.row, position.col);
		},

		getCandidateHint(row, col, level = 2) {
			const position = normalizePosition(row, col);
			const candidates = getCandidatesAt(position.row, position.col);

			return buildCandidateHint(position.row, position.col, candidates, level);
		},

		getNextStepHint(level = 3) {
			for (let row = 0; row < SUDOKU_SIZE; row += 1) {
				for (let col = 0; col < SUDOKU_SIZE; col += 1) {
					const candidates = getCandidatesAt(row, col);

					if (candidates.length === 1) {
						return buildNextStepHint(row, col, candidates, level);
					}
				}
			}

			return null;
		},

		getNextHint() {
			return this.getNextStepHint();
		},

		getConflicts() {
			return findConflicts(grid);
		},

		hasConflict() {
			return findConflicts(grid).length > 0;
		},

		getFailureReason,

		isFailed() {
			return getFailureReason() !== null;
		},

		isSolved() {
			if (this.hasConflict()) {
				return false;
			}

			for (let row = 0; row < SUDOKU_SIZE; row += 1) {
				for (let col = 0; col < SUDOKU_SIZE; col += 1) {
					if (grid[row][col] === 0) {
						return false;
					}
				}
			}

			return true;
		},

		getSignature() {
			return grid.map((row) => row.join('')).join('|');
		},

		clone() {
			return createSudokuFromJSON({ givens, grid });
		},

		toJSON() {
			return {
				givens: cloneGrid(givens),
				grid: cloneGrid(grid),
			};
		},

		toString() {
			return grid.map((row) => row.join(' ')).join('\n');
		},
	};
}

export function createSudoku(input) {
	validateGrid(input, 'Sudoku grid');
	validateSolvedState(input, 'Sudoku grid');

	return createSudokuState({ givens: input, grid: input });
}

export function createSudokuFromJSON(json) {
	validateJSONState(json);

	return createSudokuState({ givens: json.givens, grid: json.grid });
}
