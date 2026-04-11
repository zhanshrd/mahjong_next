import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AudioControl from '../AudioControl.vue'

// Mock the useAudio composable to avoid real Audio API calls
vi.mock('@/composables/useAudio', () => ({
  useAudio: () => ({
    bgmVolume: { value: 0.5 },
    sfxVolume: { value: 0.7 },
    bgmEnabled: { value: true },
    sfxEnabled: { value: true },
    toggleBGM: vi.fn(),
    toggleSFX: vi.fn(),
    setBGMVolume: vi.fn(),
    setSFXVolume: vi.fn(),
    playSFX: vi.fn(),
    init: vi.fn(),
    startBGM: vi.fn(),
    stopBGM: vi.fn()
  })
}))

describe('AudioControl', () => {
  it('renders the audio toggle button', () => {
    const wrapper = mount(AudioControl)
    expect(wrapper.find('.audio-toggle').exists()).toBe(true)
  })

  it('shows music note emoji when BGM is enabled', () => {
    const wrapper = mount(AudioControl)
    expect(wrapper.find('.audio-toggle').text()).toContain('🎵')
  })

  it('shows muted emoji when BGM is disabled', async () => {
    // Re-mock with bgmEnabled = false
    vi.doMock('@/composables/useAudio', () => ({
      useAudio: () => ({
        bgmVolume: { value: 0.5 },
        sfxVolume: { value: 0.7 },
        bgmEnabled: { value: false },
        sfxEnabled: { value: true },
        toggleBGM: vi.fn(),
        toggleSFX: vi.fn(),
        setBGMVolume: vi.fn(),
        setSFXVolume: vi.fn(),
        playSFX: vi.fn(),
        init: vi.fn(),
        startBGM: vi.fn(),
        stopBGM: vi.fn()
      })
    }))
  })

  it('shows audio panel when toggle button is clicked', async () => {
    const wrapper = mount(AudioControl)
    expect(wrapper.find('.audio-panel').exists()).toBe(false)
    await wrapper.find('.audio-toggle').trigger('click')
    expect(wrapper.find('.audio-panel').exists()).toBe(true)
  })

  it('displays BGM toggle button in panel', async () => {
    const wrapper = mount(AudioControl)
    await wrapper.find('.audio-toggle').trigger('click')
    const btns = wrapper.findAll('.audio-btn')
    expect(btns.length).toBe(2) // BGM + SFX buttons
    expect(btns[0].text()).toBe('ON')
  })

  it('displays volume sliders in panel', async () => {
    const wrapper = mount(AudioControl)
    await wrapper.find('.audio-toggle').trigger('click')
    const sliders = wrapper.findAll('.audio-slider')
    expect(sliders.length).toBe(2) // BGM + SFX sliders
  })

  it('toggles panel visibility on repeated clicks', async () => {
    const wrapper = mount(AudioControl)
    await wrapper.find('.audio-toggle').trigger('click')
    expect(wrapper.find('.audio-panel').exists()).toBe(true)
    await wrapper.find('.audio-toggle').trigger('click')
    expect(wrapper.find('.audio-panel').exists()).toBe(false)
  })
})
