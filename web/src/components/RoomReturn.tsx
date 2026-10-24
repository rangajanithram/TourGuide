'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {useAuth} from '@/context/AuthContext';
import {roomReturnPath} from '@/lib/room-service';
export default function RoomReturn(){
 const {user}=useAuth(),path=usePathname();
 useEffect(()=>{if(!user||!['/guide','/verified'].includes(path))return;try{const target=roomReturnPath(sessionStorage.getItem('tripweave-room-return'));if(target){sessionStorage.removeItem('tripweave-room-return');location.replace(target);}}catch{}},[user,path]);
 return null;
}
