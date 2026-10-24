export function setReasoningMood(level:string){
 const safe=['none','minimal','low','medium','high','xhigh','max','ultra'].includes(level)?level:'';
 localStorage.setItem('scoreler.reasoning-mood',safe);
 document.documentElement.dataset.reasoning=safe;
 window.dispatchEvent(new CustomEvent('scoreler-reasoning-mood',{detail:safe}));
}
