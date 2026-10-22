import { expect, it } from 'vitest';
import { classifyMeaning } from '../../../src/server/approval/meaning.js';
it.each([
 ['Yes','approve'],['Allow once','approve'],['Proceed','approve'],['Trust folder','approve'],['Continue','approve'],
 ['No','deny'],['Deny','deny'],['Reject this','deny'],['Quit','deny'],['Exit','deny'],['Cancel','deny'],['Abort','deny'],
 ["Yes, don't ask again",'approve_always'],['Do not ask again','approve_always'],['Always allow','approve_always'],
 ['Yes, for this session','approve_always'],['Allow all','approve_always'],['Remember this','approve_always'],
 ["No, don't ask again",'approve_always'],['Show details','unknown'],['Yesterday','unknown']
])('classifies %s',(label,meaning) => expect(classifyMeaning(label!)).toBe(meaning));
