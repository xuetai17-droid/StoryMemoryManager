// Story Memory Manager v0.11.65 compatibility entry
// The implementation lives in the versioned module selected by manifest.json.
// Native module caching makes both entry paths share one implementation.
void import('./index-v0.11.65.js').catch(error => {
    console.error('[StoryMemory] v0.11.65 module could not be loaded', error);
    globalThis.toastr?.error?.('SMM v0.11.65 脚本加载失败，请检查扩展文件是否完整。', 'SMM');
});
