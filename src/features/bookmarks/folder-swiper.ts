import Swiper from 'swiper'
import { Mousewheel } from 'swiper/modules'
import 'swiper/css'

export type PinnedFolderSlide = {
  readonly id: string
  readonly name: string
}

export type FolderSwiperHandle = {
  rebuild(folders: readonly PinnedFolderSlide[], activeId: string): void
  slideTo(folderId: string): void
  setMousewheelEnabled(enabled: boolean): void
  destroy(): void
}

export function getActiveBookmarksList(): HTMLElement | null {
  return document.querySelector('.swiper-slide-active .bookmarks-list')
    ?? document.querySelector('.bookmarks-list')
    ?? document.getElementById('bookmarks-list')
}

export function getActiveBookmarksContainer(): HTMLElement | null {
  return document.querySelector('.swiper-slide-active .bookmarks-container')
    ?? document.querySelector('.bookmarks-container')
}

export function getActiveFolderName(): HTMLElement | null {
  return document.querySelector('.swiper-slide-active .folder-name')
    ?? document.querySelector('.folder-name')
    ?? document.getElementById('folder-name')
}

export function queryBookmarksList(folderId: string): HTMLElement | null {
  const pinned = document.querySelector(`.swiper-slide[data-folder-id="${CSS.escape(folderId)}"] .bookmarks-list`)
  if (pinned instanceof HTMLElement) return pinned
  return getActiveBookmarksList()
}

function updateScrollFades(list: HTMLElement): void {
  const scroller = list.parentElement
  if (!(scroller instanceof HTMLElement) || !scroller.classList.contains('bookmarks-scroller')) return
  const canScroll = list.scrollHeight > list.clientHeight + 1
  const atTop = list.scrollTop <= 1
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1
  scroller.classList.toggle('fade-top', canScroll && !atTop)
  scroller.classList.toggle('fade-bottom', canScroll && !atBottom)
}

const listObservers = new WeakMap<HTMLElement, { resize: ResizeObserver; mutate: MutationObserver }>()

function bindInnerScroll(list: HTMLElement): void {
  const syncFades = () => updateScrollFades(list)

  list.addEventListener('wheel', (event) => {
    if (list.scrollHeight <= list.clientHeight + 1) return
    const atTop = list.scrollTop <= 0
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1
    if ((event.deltaY < 0 && !atTop) || (event.deltaY > 0 && !atBottom)) {
      event.stopPropagation()
    }
  }, { passive: true })

  list.addEventListener('scroll', syncFades, { passive: true })
  const resize = new ResizeObserver(syncFades)
  const mutate = new MutationObserver(syncFades)
  resize.observe(list)
  mutate.observe(list, { childList: true })
  listObservers.set(list, { resize, mutate })
  syncFades()
}

function releaseListObservers(root: ParentNode): void {
  root.querySelectorAll('.bookmarks-list').forEach((node) => {
    if (!(node instanceof HTMLElement)) return
    const observers = listObservers.get(node)
    observers?.resize.disconnect()
    observers?.mutate.disconnect()
    listObservers.delete(node)
  })
}

function createSlide(folder: PinnedFolderSlide): HTMLElement {
  const slide = document.createElement('div')
  slide.className = 'swiper-slide'
  slide.dataset["folderId"] = folder.id

  const container = document.createElement('div')
  container.className = 'bookmarks-container loaded'

  const name = document.createElement('div')
  name.className = 'folder-name'

  const scroller = document.createElement('div')
  scroller.className = 'bookmarks-scroller'

  const list = document.createElement('div')
  list.className = 'bookmarks-list'
  bindInnerScroll(list)

  scroller.append(list)
  container.append(name, scroller)
  slide.append(container)
  return slide
}

export function createFolderSwiper(
  container: HTMLElement,
  onPinnedChange: (folderId: string) => void,
): FolderSwiperHandle {
  let swiper: Swiper | null = null
  let mousewheelEnabled = false

  function applyMousewheel(): void {
    if (!swiper) return
    const canSwitch = swiper.slides.length > 1
    swiper.allowTouchMove = canSwitch && mousewheelEnabled
    if (mousewheelEnabled && canSwitch) swiper.mousewheel.enable()
    else swiper.mousewheel.disable()
  }

  function rebuild(folders: readonly PinnedFolderSlide[], activeId: string): void {
    const wrapper = container.querySelector('.swiper-wrapper')
    if (wrapper instanceof HTMLElement) releaseListObservers(wrapper)
    swiper?.destroy(true, true)
    swiper = null
    if (!(wrapper instanceof HTMLElement) || folders.length === 0) return
    wrapper.replaceChildren(...folders.map(createSlide))
    const initialSlide = Math.max(0, folders.findIndex((folder) => folder.id === activeId))
    swiper = new Swiper(container, {
      modules: [Mousewheel],
      direction: 'vertical',
      slidesPerView: 1,
      spaceBetween: 32,
      speed: 700,
      initialSlide,
      watchOverflow: true,
      preventClicks: false,
      preventClicksPropagation: false,
      mousewheel: {
        enabled: false,
        forceToAxis: true,
        thresholdDelta: 40,
        thresholdTime: 400,
      },
      on: {
        slideChangeTransitionEnd(instance) {
          const folderId = instance.slides[instance.activeIndex]?.dataset["folderId"]
          if (folderId !== undefined) onPinnedChange(folderId)
        },
      },
    })
    applyMousewheel()
  }

  return {
    rebuild,
    slideTo(folderId: string) {
      if (!swiper) return
      const index = swiper.slides.findIndex((slide) => slide.dataset["folderId"] === folderId)
      if (index >= 0 && index !== swiper.activeIndex) swiper.slideTo(index)
    },
    setMousewheelEnabled(enabled: boolean) {
      mousewheelEnabled = enabled
      applyMousewheel()
    },
    destroy() {
      const wrapper = container.querySelector('.swiper-wrapper')
      if (wrapper instanceof HTMLElement) releaseListObservers(wrapper)
      swiper?.destroy(true, true)
      swiper = null
    },
  }
}
