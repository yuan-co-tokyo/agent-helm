import { expect, test } from 'vitest';
import { HelmApiError } from '../../src/web/api/client.js';
import { classifySendError, countChars, fromResult } from '../../src/web/lib/send-state.js';
test.each([[0,'network','unknown'],[500,'internal','unknown'],[200,'bad_response','unknown'],[409,'stale','stale'],[410,'gone','gone'],[413,'payload_too_large','rejected'],[403,'csrf_invalid','rejected'],[501,'not_implemented','rejected']])('classifies %s %s', (status,code,kind)=> {
 expect(classifySendError(new HelmApiError(Number(status),String(code))).kind).toBe(kind);
});
test('maps results and conservatively counts UTF-16',()=> {
 expect(fromResult({requestId:'x',outcome:'sent',after:{text:'after',capturedAt:'now',lines:1,source:'tmux'}})).toMatchObject({kind:'sent',after:{text:'after'}});
 expect(fromResult({requestId:'x',outcome:'rejected',reason:'no'})).toEqual({kind:'rejected',reason:'no'});
 expect(fromResult({requestId:'x',outcome:'unknown'})).toEqual({kind:'unknown'});
 expect(countChars('😀')).toBe(2);
});
