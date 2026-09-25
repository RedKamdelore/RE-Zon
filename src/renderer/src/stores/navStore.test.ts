import {beforeEach,it,expect} from 'vitest'
import {useNavStore} from './navStore'
beforeEach(()=>useNavStore.setState({view:{name:'home'},past:[],future:[]}))
it('restores a deep route through back and forward and clears forward after branching',()=>{
 const nav=useNavStore.getState()
 nav.setView({name:'library',section:'albums'})
 nav.setView({name:'album',album:'Night',artist:'North',albumKey:'a'})
 nav.back()
 expect(useNavStore.getState().view).toEqual({name:'library',section:'albums'})
 nav.forward()
 expect(useNavStore.getState().view).toEqual({name:'album',album:'Night',artist:'North',albumKey:'a'})
 nav.back()
 nav.setView({name:'sources'})
 expect(useNavStore.getState().future).toEqual([])
})
it('does not duplicate current destinations in history',()=>{
 useNavStore.getState().setView({name:'home'})
 expect(useNavStore.getState().past).toEqual([])
})
