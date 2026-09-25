import { describe,it,expect } from 'vitest'
import { buildCatalog, preferredSource } from './catalog'
import type { Track } from './types'
const t=(id:string,title='Song',durationSec=180):Track=>({id,sourceId:id.split(':')[0],title,artist:'Artist',album:'Album',durationSec,filePath:'https://example.com/'+id})
describe('unified catalog',()=>{
 it('groups matching sources and prefers a local file',()=>{const e=buildCatalog([t('vk:1'),t('local:1')],[],{});expect(e).toHaveLength(1);expect(e[0].sources).toHaveLength(2);expect(preferredSource(e[0])?.id).toBe('local:1')})
 it('keeps live/remix versions and differing durations separate',()=>{expect(buildCatalog([t('vk:1'),t('vk:2','Song (Live)'),t('vk:3','Song',230)],[],{})).toHaveLength(3)})
 it('does not resurrect hidden sources',()=>{expect(buildCatalog([t('vk:1')],[],{},['vk:1'])).toHaveLength(0)})
 it('retains metadata-only recordings without claiming playback',()=>{const e=buildCatalog([{...t('spotify:1'),filePath:''}],[],{});expect(e).toHaveLength(1);expect(preferredSource(e[0])).toBeUndefined()})
 it('does not merge missing artists',()=>{expect(buildCatalog([{...t('vk:1'),artist:''},{...t('vk:2'),artist:''}],[],{})).toHaveLength(2)})
})
