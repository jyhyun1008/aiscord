import type { ModelSort } from '~/utils/modelList'
import type { Model } from '~/utils/openrouter'

const RECENT_KEY = 'aiscord:recent-models'
const RECENT_MAX = 5
const BOOKMARKS_KEY = 'aiscord:bookmarks'
const SORT_KEY = 'aiscord:model-sort'
const GROUPED_KEY = 'aiscord:model-grouped'

const models = ref<Model[] | null>(null)
const error = ref('')
const recent = ref<string[]>(loadJson<string[]>(RECENT_KEY, []))
const bookmarks = ref<string[]>(loadJson<string[]>(BOOKMARKS_KEY, []))
const sort = ref<ModelSort>(loadJson<ModelSort>(SORT_KEY, 'name'))
const grouped = ref(loadJson(GROUPED_KEY, true))
let loading: Promise<void> | null = null

if (import.meta.client) {
  watch(sort, value => saveJson(SORT_KEY, value))
  watch(grouped, value => saveJson(GROUPED_KEY, value))
}

export function useModels() {
  function load() {
    if (models.value) return Promise.resolve()
    loading ??= fetchModels()
      .then((list) => {
        models.value = list.sort((a, b) => a.name.localeCompare(b.name))
        error.value = ''
      })
      .catch((e) => {
        error.value = e instanceof Error ? e.message : String(e)
      })
      .finally(() => {
        loading = null
      })
    return loading
  }

  function nameOf(id: string) {
    const known = models.value?.find(m => m.id === id)
    return shortModelName(known?.name ?? id)
  }

  function touch(id: string) {
    recent.value = [id, ...recent.value.filter(m => m !== id)].slice(0, RECENT_MAX)
    saveJson(RECENT_KEY, recent.value)
  }

  const isBookmarked = (id: string) => bookmarks.value.includes(id)

  function toggleBookmark(id: string) {
    bookmarks.value = isBookmarked(id) ? bookmarks.value.filter(m => m !== id) : [...bookmarks.value, id]
    saveJson(BOOKMARKS_KEY, bookmarks.value)
  }

  function setBookmarks(ids: string[]) {
    bookmarks.value = ids
    saveJson(BOOKMARKS_KEY, ids)
  }

  return { models, error, recent, bookmarks, sort, grouped, load, nameOf, touch, isBookmarked, toggleBookmark, setBookmarks }
}
