import { useEffect } from 'react';

export function SidebarDragActivation(){
  useEffect(()=>{
    const sync=()=>{
      const createText=document.querySelector<HTMLButtonElement>('.flow-create-row button[title="Metin kanalı oluştur"]');
      const canManage=!!createText && !createText.disabled;
      document.querySelectorAll<HTMLButtonElement>('.flow-group button.channel').forEach(button=>{
        button.draggable=canManage;
        button.classList.toggle('channel-draggable',canManage);
      });
    };
    sync();
    const observer=new MutationObserver(sync);
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','disabled']});
    return()=>observer.disconnect();
  },[]);
  return null;
}
