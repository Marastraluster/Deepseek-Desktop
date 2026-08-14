import { AppWebEntry } from '@deepseek-ai/dsh-client-web'

async function boot(): Promise<void> {
  const response = await fetch('./boot-manifest.json')
  if (!response.ok) throw new Error(`desktop boot manifest failed: HTTP ${response.status}`)
  window.__DSH_BOOT__ = await response.json() as unknown
  const root = document.getElementById('root')
  if (root === null) throw new Error('desktop Renderer is missing #root')
  void new AppWebEntry(root).run()
}

void boot()
