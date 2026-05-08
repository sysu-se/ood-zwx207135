<script>
	import { CANDIDATE_COORDS } from '@sudoku/constants';

	export let candidates = [];
	export let hinted = false;
</script>

<div class="candidate-grid" class:hinted={hinted}>
	{#each CANDIDATE_COORDS as [row, col], index}
		<div class="candidate row-start-{row} col-start-{col}"
		     class:invisible={!candidates.includes(index + 1)}
		     class:visible={candidates.includes(index + 1)}>
			{index + 1}
		</div>
	{/each}
</div>

<style>
	.candidate-grid {
		@apply grid h-full w-full p-1;
	}

	.candidate {
		@apply h-full w-full row-end-auto col-end-auto leading-full;
	}

	.hinted .candidate {
		@apply font-bold text-yellow-700;
	}
</style>
