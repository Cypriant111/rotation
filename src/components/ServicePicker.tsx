import { useApp } from '../state/store'
import type { Service } from '../lib/types'
import { Segmented } from './Segmented'

/** Apple Music or Spotify; steers instructions, Mixes links and card footers. */
export function ServicePicker() {
  const { settings, saveSettings } = useApp()
  return (
    <Segmented<Service>
      options={[
        { value: 'apple', label: 'Apple Music' },
        { value: 'spotify', label: 'Spotify' },
      ]}
      value={settings.service}
      onChange={(service) => saveSettings({ service })}
    />
  )
}
