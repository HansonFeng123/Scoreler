/** Library order follows creation, so editing an older item does not move it up. */
export function newestFirst<T extends {createdAt?:string;updatedAt?:string}>(items:readonly T[]):T[]{
 const time=(item:T)=>{const value=Date.parse(item.createdAt??item.updatedAt??'');return Number.isFinite(value)?value:0;};
 return [...items].sort((a,b)=>time(b)-time(a));
}
