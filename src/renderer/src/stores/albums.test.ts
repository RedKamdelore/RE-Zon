import {expect,it} from 'vitest'
import {deriveAlbums,albumEntries} from './albums'
import type {CatalogEntry} from '@shared/catalog'
const entry=(id:string,artist:string,album:string):CatalogEntry=>({id,title:id,artist,album,durationSec:1,sources:[]})
it('keeps albums with identical titles by different artists separate',()=>{
 const albums=deriveAlbums([entry('1','First','Greatest Hits'),entry('2','Second','Greatest Hits'),entry('3','First','Greatest Hits')])
 expect(albums).toHaveLength(2)
 expect(albums[0].entries.map(t=>t.id)).toEqual(['1','3'])
})
it('does not present missing albums or provider labels as albums',()=>{
 expect(deriveAlbums([entry('1','A',''),entry('2','A','VK'),entry('3','A','Без альбома')])).toEqual([])
})

it('groups the supplied VK guest credits into one six-track album regardless of order',()=>{
 const tracks=[entry('1','ТАйМСКВЕР, DETACH','Вкус крови'),...['2','3','4','5'].map(id=>entry(id,'ТАйМСКВЕР','Вкус крови')),entry('6','ТАйМСКВЕР, TRITIA','Вкус крови')]
 const albums=deriveAlbums(tracks)
 expect(albums).toHaveLength(1);expect(albums[0].artist).toBe('ТАйМСКВЕР');expect(albums[0].entries).toHaveLength(6)
 expect(albumEntries(tracks,'Вкус крови','ТАйМСКВЕР')).toHaveLength(6)
 expect(albumEntries(tracks,'Вкус крови','ТАйМСКВЕР, DETACH')).toHaveLength(6)
})
it('recognizes explicit feat credits while retaining a distinct artist album',()=>{
 const albums=deriveAlbums([entry('1','Artist feat. Guest','Album'),entry('2','Artist ft. Other','Album'),entry('3','Different','Album')])
 expect(albums).toHaveLength(2);expect(albums.find(a=>a.artist==='Artist')?.entries).toHaveLength(2)
})
it('does not split band names containing commas without evidence of a lead artist',()=>{
 expect(deriveAlbums([entry('1','Earth, Wind & Fire','Album')])[0].artist).toBe('Earth, Wind & Fire')
})
it('merges an album of collaborations without a solo song using shared artwork',()=>{
 const tracks=[{...entry('1','Guest, Main','Release'),coverDataUrl:'https://img.test/cover.jpg?a=1'},{...entry('2','Main & Other','Release'),coverDataUrl:'https://img.test/cover.jpg?a=2'}]
 expect(deriveAlbums(tracks)).toHaveLength(1)
 expect(deriveAlbums(tracks)[0].artist).toBe('Main')
})
it('uses release identity even when every song has different performers',()=>{
 const tracks=[{...entry('1','A','Compilation'),albumId:'vk:1:2'},{...entry('2','B','Compilation'),albumId:'vk:1:2'}]
 expect(deriveAlbums(tracks)).toHaveLength(1)
})
it('uses album artist from tags without changing track artist credits',()=>{
 const tracks=[{...entry('1','A & B','Release'),albumArtist:'A'},{...entry('2','C','Release'),albumArtist:'A'}]
 expect(deriveAlbums(tracks)).toHaveLength(1)
 expect(deriveAlbums(tracks)[0].entries[1].artist).toBe('C')
})
it('keeps distinct known releases separate and opens each by its key',()=>{
 const tracks=[{...entry('1','A','Release'),albumId:'vk:1:1',coverDataUrl:'https://img.test/same'},{...entry('2','A','Release'),albumId:'vk:1:2',coverDataUrl:'https://img.test/same'}]
 const albums=deriveAlbums(tracks);expect(albums).toHaveLength(2)
 expect(albumEntries(tracks,'Release','A',albums[1].id).map(e=>e.id)).toEqual(['2'])
})
it('does not create fake unnamed albums',()=>{
 expect(deriveAlbums([entry('1','A','unnamed'),entry('2','B','Неизвестный альбом')])).toEqual([])
})
it('groups ampersand and semicolon credits with the lead performer',()=>{
 expect(deriveAlbums([entry('1','Main & Guest','Album'),entry('2','Main; Other','Album')])).toHaveLength(1)
})
it('groups a tribute compilation with different track artists and artwork',()=>{
 const albums=deriveAlbums([entry('1','[Amatory]','Родина (Трибьют ДДТ)'),entry('2','СiРОП','Родина (Трибьют ДДТ)')])
 expect(albums).toHaveLength(1);expect(albums[0].artist).toBe('Разные исполнители')
})
