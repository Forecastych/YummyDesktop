<script lang="ts">
  import { Api } from '../lib/api/endpoints'
  import Loader from '../lib/components/Loader.svelte'
  import { errorText } from '../lib/query.svelte'
  import { go } from '../lib/router.svelte'

  let error = $state<string | null>(null)

  async function roll() {
    error = null
    try {
      const [a] = await Api.list({ sort: 'random', limit: 1, status: ['released', 'ongoing'] }, { ttl: 0 })
      if (a) go(`/anime/${a.anime_url}`, true)
      else error = 'Не удалось подобрать тайтл'
    } catch (e) {
      error = errorText(e)
    }
  }

  roll()
</script>

<Loader {error} retry={roll} />
