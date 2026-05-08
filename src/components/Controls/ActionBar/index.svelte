<script>
	import Timer from './Timer.svelte';
	import Actions from './Actions.svelte';
	import { exploreState, hintState } from '@sudoku/stores/history';
</script>

<div class="action-bar space-y-3 xs:space-y-0">
	<Timer />

	<Actions />
</div>

{#if $hintState}
	<div class="hint-status">
		Hint level {$hintState.level}/{$hintState.maxLevel}: {$hintState.message || $hintState.reason}
	</div>
{/if}

{#if $exploreState.isExploring}
	<div class="explore-status" class:failed={$exploreState.hasFailedCurrentPath}>
		{#if $exploreState.hasFailedCurrentPath}
			This board has already failed in exploration. Undo or abandon, then try a different branch.
		{:else}
			Explore mode: trial numbers are highlighted in blue.
		{/if}
		{#if $exploreState.branchId}
			<span class="branch-label">Path {$exploreState.branchId}{#if $exploreState.branchCount > 1} · {$exploreState.branchCount} forked paths{/if}</span>
		{/if}
	</div>
{/if}

<style>
	.action-bar {
		@apply flex flex-col flex-wrap justify-between pb-5;
	}

	.hint-status {
		@apply -mt-2 mb-4 px-3 py-2 rounded-lg text-sm text-yellow-800 bg-yellow-100;
	}

	.explore-status {
		@apply -mt-2 mb-4 px-3 py-2 rounded-lg text-sm text-blue-700 bg-blue-100;
	}

	.branch-label {
		@apply ml-2 font-semibold;
	}

	.failed {
		@apply text-red-700 bg-red-100;
	}

	@screen xs {
		.action-bar {
			@apply flex-row;
		}
	}
</style>
