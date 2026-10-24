// Private data is provided in memory by the authenticated application shell.
if(window.parent===window||!window.parent.KebbiSession?.master){location.replace('../index.html');throw Error('Login required');}
window.KEBBI_MASTER=window.parent.KebbiSession.master;
Object.defineProperty(window,'localStorage',{value:window.parent.KebbiSession.storage});
window.addEventListener('DOMContentLoaded',()=>{
 document.addEventListener('click',e=>{const a=e.target.closest('a[href="datamgmt.html"],a[href="index.html"]');if(a){e.preventDefault();window.parent.KebbiSession.open(a.getAttribute('href')==='datamgmt.html'?'manage':'measure');}},true);
});
