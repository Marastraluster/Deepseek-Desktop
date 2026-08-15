/** @vitest-environment jsdom */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const stylesheetPath = join(process.cwd(), 'packages/dsh-transparent-ui/src/client/aqua.module.css')

afterEach(() => {
  document.head.replaceChildren()
  document.body.replaceChildren()
  document.documentElement.removeAttribute('data-dsh-aqua')
  document.documentElement.removeAttribute('data-dsh-float')
})

it('keeps the Mica wallpaper behind the app frame without changing sidebar grid-track geometry', async () => {
  document.documentElement.setAttribute('data-dsh-aqua', '')
  document.documentElement.setAttribute('data-dsh-float', '')
  document.body.innerHTML = `
    <div data-dsh-aqua-ambient></div>
    <div data-dsh-frame>
      <div class="sidebarCol-shell"><div data-dsh-sidebar-root></div></div>
    </div>
  `
  const style = document.createElement('style')
  style.textContent = await readFile(stylesheetPath, 'utf8')
  document.head.append(style)

  const ambient = document.querySelector<HTMLElement>('[data-dsh-aqua-ambient]')
  const frame = document.querySelector<HTMLElement>('[data-dsh-frame]')
  const sidebar = document.querySelector<HTMLElement>('[class*="sidebarCol"]')
  const sidebarRoot = document.querySelector<HTMLElement>('[data-dsh-sidebar-root]')

  expect(ambient).not.toBeNull()
  expect(frame).not.toBeNull()
  expect(sidebar).not.toBeNull()
  expect(sidebarRoot).not.toBeNull()
  expect(getComputedStyle(ambient!).zIndex).toBe('0')
  expect(getComputedStyle(frame!).zIndex).toBe('1')
  expect(getComputedStyle(sidebar!).margin).toBe('0px')
  expect(getComputedStyle(sidebarRoot!).margin).toBe('12px')
})

it('does not apply Mica sidebar geometry to nested settings containers', async () => {
  document.documentElement.setAttribute('data-dsh-aqua', '')
  document.documentElement.setAttribute('data-dsh-float', '')
  document.body.innerHTML = `
    <div data-dsh-frame>
      <div class="sidebarCol-shell"><div data-dsh-sidebar-root></div></div>
      <main>
        <div class="sidebarCol-settings">Settings content</div>
      </main>
    </div>
  `
  const baseline = document.createElement('style')
  baseline.textContent = '.sidebarCol-settings { overflow: auto; background: rgb(1, 2, 3); }'
  document.head.append(baseline)
  const style = document.createElement('style')
  style.textContent = await readFile(stylesheetPath, 'utf8')
  document.head.append(style)

  const settingsContainer = document.querySelector<HTMLElement>('.sidebarCol-settings')

  expect(settingsContainer).not.toBeNull()
  expect(getComputedStyle(settingsContainer!).overflow).toBe('auto')
  expect(getComputedStyle(settingsContainer!).backgroundColor).toBe('rgb(1, 2, 3)')
})
