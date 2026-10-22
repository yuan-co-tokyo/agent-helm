import { expect, test } from 'vitest';
import { HelmApiError } from '../../src/web/api/client.js';
import { classifySendError, countChars, fromResult } from '../../src/web/lib/send-state.js';
test.each([[0,'network','unknown'],[500,'internal','unknown'],[200,'bad_response','unknown'],[409,'stale','stale'],[410,'gone','gone'],[413,'payload_too_large','rejected'],[403,'csrf_invalid','rejected'],[501,'not_implemented','rejected']])('classifies %s %s', (status,code,kind)=> {
 expect(classifySendError(new HelmApiError(Number(status),String(code))).kind).toBe(kind);
});
test('maps results and conservatively counts UTF-16',()=> {
 expect(fromResult({requestId:'x',outcome:'sent',after:{text:'after',capturedAt:'now',lines:1,source:'tmux'}})).toMatchObject({kind:'sent',after:{text:'after'}});
 expect(fromResult({requestId:'x',outcome:'rejected',reason:'no'})).toEqual({kind:'rejected',reason:'送信できない状態です（コード: no）'});
 expect(fromResult({requestId:'x',outcome:'unknown'})).toEqual({kind:'unknown'});
 expect(countChars('😀')).toBe(2);
});
test('explains unconfirmed delivery and selection without Enter',async()=> {
 const {sendMessage} = await import('../../src/web/lib/send-state.js');
 expect(sendMessage(fromResult({requestId:'x',outcome:'sent_unconfirmed'}),true)).toContain('画面が変わっていません');
 for (const reason of ['selection_unverified','prompt_changed']) expect(sendMessage(fromResult({requestId:'x',outcome:'unknown',reason}),true)).toContain('Enter）は送っていません');
 expect(fromResult({requestId:'x',outcome:'rejected',reason:'input_not_empty'})).toMatchObject({reason:expect.stringContaining('入力欄に文字')});
});
