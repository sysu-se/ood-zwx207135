import { createSudokuFromJSON } from './sudoku.js';

function isObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneGrid(grid) {
	return grid.map((row) => row.slice());
}

function validateSudoku(sudoku) {
	if (
		!isObject(sudoku) ||
		typeof sudoku.clone !== 'function' ||
		typeof sudoku.guess !== 'function' ||
		typeof sudoku.getGrid !== 'function' ||
		typeof sudoku.toJSON !== 'function'
	) {
		throw new Error('Game requires a valid sudoku object');
	}
}

function normalizeGameMode(mode) {
	if (mode === undefined) {
		return 'normal';
	}

	if (mode !== 'normal' && mode !== 'explore') {
		throw new Error('Game mode must be normal or explore');
	}

	return mode;
}

function requireObjectField(json, fieldName, label) {
	if (!(fieldName in json)) {
		throw new Error(`${label} must include ${fieldName}`);
	}

	if (!isObject(json[fieldName])) {
		throw new Error(`${label} ${fieldName} must be an object`);
	}

	return json[fieldName];
}

function optionalSudokuField(json, fieldName, fallback) {
	if (!(fieldName in json)) {
		return fallback;
	}

	if (!isObject(json[fieldName])) {
		throw new Error(`Game ${fieldName} must be an object`);
	}

	return json[fieldName];
}

function deserializeSudokuStack(stack, label) {
	if (!Array.isArray(stack)) {
		throw new Error(`${label} must be an array`);
	}

	return stack.map((item) => createSudokuFromJSON(item));
}

function normalizeFailedExplorations(records) {
	if (records === undefined) {
		return [];
	}

	if (!Array.isArray(records)) {
		throw new Error('Failed explorations must be an array');
	}

	return records.map((record) => {
		if (!isObject(record) || typeof record.signature !== 'string' || !Array.isArray(record.grid)) {
			throw new Error('Failed exploration records must include signature and grid');
		}

		return {
			signature: record.signature,
			reason: record.reason || 'failed',
			grid: cloneGrid(record.grid),
			move: record.move ? { ...record.move } : undefined,
		};
	});
}

function normalizeExploreBranches(records) {
	if (records === undefined) {
		return [];
	}

	if (!Array.isArray(records)) {
		throw new Error('Explore branches must be an array');
	}

	return records.map((record) => {
		if (!isObject(record) || typeof record.id !== 'string') {
			throw new Error('Explore branch records must include an id');
		}

		return {
			id: record.id,
			parentId: typeof record.parentId === 'string' ? record.parentId : null,
			createdFromSignature: typeof record.createdFromSignature === 'string' ? record.createdFromSignature : '',
			currentSignature: typeof record.currentSignature === 'string' ? record.currentSignature : '',
			status: ['active', 'committed', 'abandoned', 'failed'].includes(record.status) ? record.status : 'active',
			moves: Array.isArray(record.moves) ? record.moves.map((move) => ({ ...move })) : [],
			failedSignatures: Array.isArray(record.failedSignatures) ? record.failedSignatures.slice() : [],
		};
	});
}

function cloneBranch(branch) {
	return {
		id: branch.id,
		parentId: branch.parentId,
		createdFromSignature: branch.createdFromSignature,
		currentSignature: branch.currentSignature,
		status: branch.status,
		moves: branch.moves.map((move) => ({ ...move })),
		failedSignatures: branch.failedSignatures.slice(),
	};
}

function serializeStack(stack) {
	return stack.map((item) => item.toJSON());
}

function diffGrids(baseGrid, currentGrid) {
	const changed = [];

	for (let row = 0; row < currentGrid.length; row += 1) {
		for (let col = 0; col < currentGrid[row].length; col += 1) {
			if (baseGrid[row][col] !== currentGrid[row][col]) {
				changed.push({ row, col });
			}
		}
	}

	return changed;
}

function createGameState({
	currentSudoku: initialSudoku,
	undoStack: initialUndoStack = [],
	redoStack: initialRedoStack = [],
	mode: initialMode = 'normal',
	exploreBaseSudoku: initialExploreBaseSudoku = null,
	exploreUndoStack: initialExploreUndoStack = [],
	exploreRedoStack: initialExploreRedoStack = [],
	failedExplorations: initialFailedExplorations = [],
	exploreBranches: initialExploreBranches = [],
	exploreBranchId: initialExploreBranchId = null,
	nextExploreBranchNumber: initialNextExploreBranchNumber = 1,
}) {
	let currentSudoku = initialSudoku;
	let undoStack = initialUndoStack.slice();
	let redoStack = initialRedoStack.slice();
	let mode = initialMode === 'explore' ? 'explore' : 'normal';
	let exploreBaseSudoku = mode === 'explore' ? initialExploreBaseSudoku : null;
	let exploreUndoStack = mode === 'explore' ? initialExploreUndoStack.slice() : [];
	let exploreRedoStack = mode === 'explore' ? initialExploreRedoStack.slice() : [];
	let exploreBranchId = typeof initialExploreBranchId === 'string' ? initialExploreBranchId : null;
	let nextExploreBranchNumber = Number.isInteger(initialNextExploreBranchNumber) && initialNextExploreBranchNumber > 0 ? initialNextExploreBranchNumber : 1;
	const failedExplorations = new Map();
	const exploreBranches = new Map();

	for (const record of initialFailedExplorations) {
		failedExplorations.set(record.signature, {
			signature: record.signature,
			reason: record.reason,
			grid: cloneGrid(record.grid),
			move: record.move ? { ...record.move } : undefined,
		});
	}

	for (const branch of initialExploreBranches) {
		exploreBranches.set(branch.id, cloneBranch(branch));
	}

	if (mode === 'explore' && !exploreBaseSudoku) {
		exploreBaseSudoku = currentSudoku.clone();
	}

	function isExploring() {
		return mode === 'explore';
	}

	function activeUndoStack() {
		return isExploring() ? exploreUndoStack : undoStack;
	}

	function activeRedoStack() {
		return isExploring() ? exploreRedoStack : redoStack;
	}

	function setActiveRedoStack(nextStack) {
		if (isExploring()) {
			exploreRedoStack = nextStack;
		} else {
			redoStack = nextStack;
		}
	}

	function branchRecords() {
		return Array.from(exploreBranches.values()).map(cloneBranch);
	}

	function activeBranch() {
		return exploreBranchId ? exploreBranches.get(exploreBranchId) || null : null;
	}

	function createExploreBranch({ parentId = null, createdFromSignature = currentSudoku.getSignature() } = {}) {
		const id = `branch-${nextExploreBranchNumber}`;
		nextExploreBranchNumber += 1;
		const branch = {
			id,
			parentId,
			createdFromSignature,
			currentSignature: createdFromSignature,
			status: 'active',
			moves: [],
			failedSignatures: [],
		};

		exploreBranches.set(id, branch);
		exploreBranchId = id;
		return branch;
	}

	function maybeForkExploreBranch(signatureBefore) {
		if (!isExploring() || activeRedoStack().length === 0) {
			return activeBranch();
		}

		const parent = activeBranch();
		return createExploreBranch({
			parentId: parent ? parent.id : null,
			createdFromSignature: signatureBefore,
		});
	}

	function markBranch(status) {
		const branch = activeBranch();

		if (branch) {
			branch.status = status;
			branch.currentSignature = currentSudoku.getSignature();
		}
	}

	function recordBranchMove(move, signatureBefore, signatureAfter) {
		const branch = activeBranch();

		if (!branch) {
			return;
		}

		branch.moves.push({
			row: move.row !== undefined ? move.row : move.y,
			col: move.col !== undefined ? move.col : move.x,
			value: move.value,
			signatureBefore,
			signatureAfter,
		});
		branch.currentSignature = signatureAfter;
	}

	function recordBranchFailure(signature) {
		const branch = activeBranch();

		if (branch && !branch.failedSignatures.includes(signature)) {
			branch.failedSignatures.push(signature);
			branch.status = 'failed';
		}
	}

	function failedRecords() {
		return Array.from(failedExplorations.values()).map((record) => ({
			signature: record.signature,
			reason: record.reason,
			grid: cloneGrid(record.grid),
			move: record.move ? { ...record.move } : undefined,
		}));
	}

	function recordFailure(signature, grid, reason, move) {
		if (!failedExplorations.has(signature)) {
			failedExplorations.set(signature, {
				signature,
				reason,
				grid: cloneGrid(grid),
				move: move ? { ...move } : undefined,
			});
		}

		if (isExploring()) {
			recordBranchFailure(signature);
		}
	}

	function recordCurrentFailure(fallbackReason = 'failed') {
		if (typeof currentSudoku.isFailed !== 'function' || !currentSudoku.isFailed()) {
			return false;
		}

		const reason = typeof currentSudoku.getFailureReason === 'function' ? currentSudoku.getFailureReason() : fallbackReason;
		recordFailure(currentSudoku.getSignature(), currentSudoku.getGrid(), reason || fallbackReason);
		return true;
	}

	function recordRejectedMove(move) {
		const row = move.row !== undefined ? move.row : move.y;
		const col = move.col !== undefined ? move.col : move.x;
		const signature = `${currentSudoku.getSignature()}#${row},${col},${move.value}`;
		recordFailure(signature, currentSudoku.getGrid(), 'rejected-move', move);
	}

	function resetExploreState() {
		mode = 'normal';
		exploreBaseSudoku = null;
		exploreUndoStack = [];
		exploreRedoStack = [];
		exploreBranchId = null;
	}

	return {
		getSudoku() {
			return currentSudoku.clone();
		},

		getGrid() {
			return currentSudoku.getGrid();
		},

		getGivens() {
			return currentSudoku.getGivens();
		},

		isGiven(row, col) {
			return currentSudoku.isGiven(row, col);
		},

		isLegalMove(move) {
			return currentSudoku.isLegalMove(move);
		},

		getConflicts() {
			return currentSudoku.getConflicts();
		},

		hasConflict() {
			return currentSudoku.hasConflict();
		},

		isSolved() {
			return currentSudoku.isSolved();
		},

		getViewState() {
			return {
				grid: currentSudoku.getGrid(),
				givens: currentSudoku.getGivens(),
				conflicts: currentSudoku.getConflicts(),
				isSolved: currentSudoku.isSolved(),
				mode,
				isExploring: isExploring(),
				exploreCells: this.getExploreCells(),
			};
		},

		guess(move) {
			const previousSudoku = currentSudoku.clone();
			const signatureBefore = currentSudoku.getSignature();

			try {
				currentSudoku.guess(move);
			} catch (error) {
				if (isExploring()) {
					recordRejectedMove(move);
				}
				throw error;
			}

			if (isExploring()) {
				maybeForkExploreBranch(signatureBefore);
			}

			activeUndoStack().push(previousSudoku);
			setActiveRedoStack([]);

			if (isExploring()) {
				recordBranchMove(move, signatureBefore, currentSudoku.getSignature());
				recordCurrentFailure();
			}
		},

		undo() {
			const undoStackForMode = activeUndoStack();

			if (!undoStackForMode.length) {
				return;
			}

			activeRedoStack().push(currentSudoku.clone());
			currentSudoku = undoStackForMode.pop();

			if (isExploring()) {
				const branch = activeBranch();
				if (branch) {
					branch.currentSignature = currentSudoku.getSignature();
				}
			}
		},

		redo() {
			const redoStackForMode = activeRedoStack();

			if (!redoStackForMode.length) {
				return;
			}

			activeUndoStack().push(currentSudoku.clone());
			currentSudoku = redoStackForMode.pop();

			if (isExploring()) {
				const branch = activeBranch();
				if (branch) {
					branch.currentSignature = currentSudoku.getSignature();
				}
				recordCurrentFailure();
			}
		},

		canUndo() {
			return activeUndoStack().length > 0;
		},

		canRedo() {
			return activeRedoStack().length > 0;
		},

		getCandidateHint(row, col, level) {
			return currentSudoku.getCandidateHint(row, col, level);
		},

		getNextStepHint(level) {
			return currentSudoku.getNextStepHint(level);
		},

		getHint(position, level = 1) {
			if (!position) {
				return currentSudoku.getNextStepHint(level);
			}

			return currentSudoku.getCandidateHint(
				position.row !== undefined ? position.row : position.y,
				position.col !== undefined ? position.col : position.x,
				level,
			);
		},

		getNextHint() {
			return currentSudoku.getNextStepHint();
		},

		applyHint(position) {
			if (!position) {
				const nextHint = currentSudoku.getNextStepHint();

				if (!nextHint) {
					return null;
				}

				this.guess({ row: nextHint.row, col: nextHint.col, value: nextHint.value });
				return nextHint;
			}

			const candidateHint = currentSudoku.getCandidateHint(
				position.row !== undefined ? position.row : position.y,
				position.col !== undefined ? position.col : position.x,
			);

			if (candidateHint.candidates.length !== 1) {
				return null;
			}

			const hint = {
				type: 'next-step',
				row: candidateHint.row,
				col: candidateHint.col,
				value: candidateHint.candidates[0],
				candidates: candidateHint.candidates,
				reason: 'Only one candidate fits this cell',
			};

			this.guess({ row: hint.row, col: hint.col, value: hint.value });
			return hint;
		},

		enterExplore() {
			if (isExploring()) {
				return this.getExploreState();
			}

			mode = 'explore';
			exploreBaseSudoku = currentSudoku.clone();
			exploreUndoStack = [];
			exploreRedoStack = [];
			createExploreBranch();

			return this.getExploreState();
		},

		commitExplore() {
			if (!isExploring()) {
				return false;
			}

			recordCurrentFailure();

			const baseSignature = exploreBaseSudoku.getSignature();
			const currentSignature = currentSudoku.getSignature();
			const committedSudoku = currentSudoku.clone();

			if (baseSignature !== currentSignature) {
				undoStack.push(exploreBaseSudoku.clone());
				redoStack = [];
			}

			currentSudoku = committedSudoku;
			markBranch('committed');
			resetExploreState();
			return true;
		},

		abandonExplore() {
			if (!isExploring()) {
				return false;
			}

			recordCurrentFailure();
			markBranch('abandoned');
			currentSudoku = exploreBaseSudoku.clone();
			resetExploreState();
			return true;
		},

		isExploring,

		getExploreCells() {
			if (!isExploring()) {
				return [];
			}

			return diffGrids(exploreBaseSudoku.getGrid(), currentSudoku.getGrid());
		},

		getExploreState() {
			return {
				mode,
				isExploring: isExploring(),
				canCommit: isExploring(),
				canAbandon: isExploring(),
				canUndo: this.canUndo(),
				canRedo: this.canRedo(),
				hasFailedCurrentPath: this.hasFailedCurrentPath(),
				failedCount: failedExplorations.size,
				branchId: exploreBranchId,
				branchCount: exploreBranches.size,
				activeBranch: this.getActiveExploreBranch(),
				branches: this.getExploreBranches(),
			};
		},

		hasFailedCurrentPath() {
			return failedExplorations.has(currentSudoku.getSignature());
		},

		getFailedExplorations() {
			return failedRecords();
		},

		getExploreBranches() {
			return branchRecords();
		},

		getActiveExploreBranch() {
			const branch = activeBranch();
			return branch ? cloneBranch(branch) : null;
		},

		toJSON() {
			const json = {
				sudoku: currentSudoku.toJSON(),
				undoStack: serializeStack(undoStack),
				redoStack: serializeStack(redoStack),
			};
			const failed = failedRecords();
			const branches = branchRecords();

			if (mode !== 'normal' || failed.length > 0) {
				json.mode = mode;
				json.failedExplorations = failed;
			}

			if (branches.length > 0) {
				json.exploreBranches = branches;
				json.exploreBranchId = exploreBranchId;
				json.nextExploreBranchNumber = nextExploreBranchNumber;
			}

			if (mode === 'explore') {
				json.exploreBaseSudoku = exploreBaseSudoku.toJSON();
				json.exploreUndoStack = serializeStack(exploreUndoStack);
				json.exploreRedoStack = serializeStack(exploreRedoStack);
			}

			return json;
		},
	};
}

export function createGame({ sudoku } = {}) {
	validateSudoku(sudoku);

	return createGameState({
		currentSudoku: sudoku.clone(),
	});
}

export function createGameFromJSON(json) {
	if (!isObject(json)) {
		throw new Error('Game JSON must be an object');
	}

	const sudokuJSON = requireObjectField(json, 'sudoku', 'Game JSON');
	const mode = normalizeGameMode(json.mode);
	const undoStack = deserializeSudokuStack('undoStack' in json ? json.undoStack : [], 'Game undoStack');
	const redoStack = deserializeSudokuStack('redoStack' in json ? json.redoStack : [], 'Game redoStack');
	const exploreUndoStack = deserializeSudokuStack('exploreUndoStack' in json ? json.exploreUndoStack : [], 'Game exploreUndoStack');
	const exploreRedoStack = deserializeSudokuStack('exploreRedoStack' in json ? json.exploreRedoStack : [], 'Game exploreRedoStack');
	const failedExplorations = normalizeFailedExplorations(json.failedExplorations);
	const exploreBranches = normalizeExploreBranches(json.exploreBranches);
	const currentSudoku = createSudokuFromJSON(sudokuJSON);
	const exploreBaseSudoku = mode === 'explore'
		? createSudokuFromJSON(optionalSudokuField(json, 'exploreBaseSudoku', sudokuJSON))
		: null;

	return createGameState({
		currentSudoku,
		undoStack,
		redoStack,
		mode,
		exploreBaseSudoku,
		exploreUndoStack,
		exploreRedoStack,
		failedExplorations,
		exploreBranches,
		exploreBranchId: json.exploreBranchId,
		nextExploreBranchNumber: json.nextExploreBranchNumber,
	});
}
