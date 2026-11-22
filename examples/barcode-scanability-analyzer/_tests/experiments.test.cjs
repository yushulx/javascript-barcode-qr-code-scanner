const {test}=require('node:test');
const assert=require('node:assert/strict');
const {summarize}=require('../experiments.js');
test('success on the original area does not claim to explain a failure',()=>assert.match(summarize([{id:'original',state:'complete',count:1}]),/do not explain/));
test('a changed decode outcome is reported as evidence rather than a proven cause',()=>{const text=summarize([{id:'original',state:'complete',count:0},{id:'invert',label:'Invert colors',state:'complete',count:1}]);assert.match(text,/Invert colors/);assert.match(text,/attributing a cause/);});
test('all failed tests explicitly leave the cause unexplained',()=>assert.match(summarize([{id:'original',state:'complete',count:0},{id:'invert',state:'complete',count:0}]),/cause remains unexplained/));
test('no baseline never becomes an inferred success or failure',()=>assert.match(summarize([{id:'original',state:'error'}]),/baseline is unavailable/));
