import { useLayoutEffect, useRef, useState } from 'react';
export function useStickToBottom(content: string) {
 const ref = useRef<HTMLPreElement>(null);
 const [pinned,setPinned] = useState(true);
 useLayoutEffect(()=> { if (pinned && ref.current) ref.current.scrollTop = ref.current.scrollHeight; },[content,pinned]);
 const onScroll = ()=> { const el = ref.current; if (el) setPinned(el.scrollHeight - el.scrollTop - el.clientHeight <= 24); };
 return {ref,pinned,onScroll,jump:()=>setPinned(true)};
}
