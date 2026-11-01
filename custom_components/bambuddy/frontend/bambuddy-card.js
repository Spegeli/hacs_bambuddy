var et=globalThis,tt=et.ShadowRoot&&(et.ShadyCSS===void 0||et.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,en=Symbol(),pi=new WeakMap,Me=class{constructor(e,n,i){if(this._$cssResult$=!0,i!==en)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=n}get styleSheet(){let e=this.o,n=this.t;if(tt&&e===void 0){let i=n!==void 0&&n.length===1;i&&(e=pi.get(n)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),i&&pi.set(n,e))}return e}toString(){return this.cssText}},ui=t=>new Me(typeof t=="string"?t:t+"",void 0,en),Be=(t,...e)=>{let n=t.length===1?t[0]:e.reduce((i,r,o)=>i+(a=>{if(a._$cssResult$===!0)return a.cssText;if(typeof a=="number")return a;throw Error("Value passed to 'css' function must be a 'css' function result: "+a+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(r)+t[o+1],t[0]);return new Me(n,t,en)},hi=(t,e)=>{if(tt)t.adoptedStyleSheets=e.map(n=>n instanceof CSSStyleSheet?n:n.styleSheet);else for(let n of e){let i=document.createElement("style"),r=et.litNonce;r!==void 0&&i.setAttribute("nonce",r),i.textContent=n.cssText,t.appendChild(i)}},tn=tt?t=>t:t=>t instanceof CSSStyleSheet?(e=>{let n="";for(let i of e.cssRules)n+=i.cssText;return ui(n)})(t):t;var{is:Io,defineProperty:Ko,getOwnPropertyDescriptor:jo,getOwnPropertyNames:Uo,getOwnPropertySymbols:Wo,getPrototypeOf:Zo}=Object,nt=globalThis,fi=nt.trustedTypes,Go=fi?fi.emptyScript:"",qo=nt.reactiveElementPolyfillSupport,Oe=(t,e)=>t,nn={toAttribute(t,e){switch(e){case Boolean:t=t?Go:null;break;case Object:case Array:t=t==null?t:JSON.stringify(t)}return t},fromAttribute(t,e){let n=t;switch(e){case Boolean:n=t!==null;break;case Number:n=t===null?null:Number(t);break;case Object:case Array:try{n=JSON.parse(t)}catch{n=null}}return n}},gi=(t,e)=>!Io(t,e),mi={attribute:!0,type:String,converter:nn,reflect:!1,useDefault:!1,hasChanged:gi};Symbol.metadata??=Symbol("metadata"),nt.litPropertyMetadata??=new WeakMap;var U=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??=[]).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,n=mi){if(n.state&&(n.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((n=Object.create(n)).wrapped=!0),this.elementProperties.set(e,n),!n.noAccessor){let i=Symbol(),r=this.getPropertyDescriptor(e,i,n);r!==void 0&&Ko(this.prototype,e,r)}}static getPropertyDescriptor(e,n,i){let{get:r,set:o}=jo(this.prototype,e)??{get(){return this[n]},set(a){this[n]=a}};return{get:r,set(a){let d=r?.call(this);o?.call(this,a),this.requestUpdate(e,d,i)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??mi}static _$Ei(){if(this.hasOwnProperty(Oe("elementProperties")))return;let e=Zo(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(Oe("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(Oe("properties"))){let n=this.properties,i=[...Uo(n),...Wo(n)];for(let r of i)this.createProperty(r,n[r])}let e=this[Symbol.metadata];if(e!==null){let n=litPropertyMetadata.get(e);if(n!==void 0)for(let[i,r]of n)this.elementProperties.set(i,r)}this._$Eh=new Map;for(let[n,i]of this.elementProperties){let r=this._$Eu(n,i);r!==void 0&&this._$Eh.set(r,n)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){let n=[];if(Array.isArray(e)){let i=new Set(e.flat(1/0).reverse());for(let r of i)n.unshift(tn(r))}else e!==void 0&&n.push(tn(e));return n}static _$Eu(e,n){let i=n.attribute;return i===!1?void 0:typeof i=="string"?i:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(e=>this.enableUpdating=e),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(e=>e(this))}addController(e){(this._$EO??=new Set).add(e),this.renderRoot!==void 0&&this.isConnected&&e.hostConnected?.()}removeController(e){this._$EO?.delete(e)}_$E_(){let e=new Map,n=this.constructor.elementProperties;for(let i of n.keys())this.hasOwnProperty(i)&&(e.set(i,this[i]),delete this[i]);e.size>0&&(this._$Ep=e)}createRenderRoot(){let e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return hi(e,this.constructor.elementStyles),e}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach(e=>e.hostConnected?.())}enableUpdating(e){}disconnectedCallback(){this._$EO?.forEach(e=>e.hostDisconnected?.())}attributeChangedCallback(e,n,i){this._$AK(e,i)}_$ET(e,n){let i=this.constructor.elementProperties.get(e),r=this.constructor._$Eu(e,i);if(r!==void 0&&i.reflect===!0){let o=(i.converter?.toAttribute!==void 0?i.converter:nn).toAttribute(n,i.type);this._$Em=e,o==null?this.removeAttribute(r):this.setAttribute(r,o),this._$Em=null}}_$AK(e,n){let i=this.constructor,r=i._$Eh.get(e);if(r!==void 0&&this._$Em!==r){let o=i.getPropertyOptions(r),a=typeof o.converter=="function"?{fromAttribute:o.converter}:o.converter?.fromAttribute!==void 0?o.converter:nn;this._$Em=r;let d=a.fromAttribute(n,o.type);this[r]=d??this._$Ej?.get(r)??d,this._$Em=null}}requestUpdate(e,n,i,r=!1,o){if(e!==void 0){let a=this.constructor;if(r===!1&&(o=this[e]),i??=a.getPropertyOptions(e),!((i.hasChanged??gi)(o,n)||i.useDefault&&i.reflect&&o===this._$Ej?.get(e)&&!this.hasAttribute(a._$Eu(e,i))))return;this.C(e,n,i)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,n,{useDefault:i,reflect:r,wrapped:o},a){i&&!(this._$Ej??=new Map).has(e)&&(this._$Ej.set(e,a??n??this[e]),o!==!0||a!==void 0)||(this._$AL.has(e)||(this.hasUpdated||i||(n=void 0),this._$AL.set(e,n)),r===!0&&this._$Em!==e&&(this._$Eq??=new Set).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(n){Promise.reject(n)}let e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(let[r,o]of this._$Ep)this[r]=o;this._$Ep=void 0}let i=this.constructor.elementProperties;if(i.size>0)for(let[r,o]of i){let{wrapped:a}=o,d=this[r];a!==!0||this._$AL.has(r)||d===void 0||this.C(r,void 0,o,d)}}let e=!1,n=this._$AL;try{e=this.shouldUpdate(n),e?(this.willUpdate(n),this._$EO?.forEach(i=>i.hostUpdate?.()),this.update(n)):this._$EM()}catch(i){throw e=!1,this._$EM(),i}e&&this._$AE(n)}willUpdate(e){}_$AE(e){this._$EO?.forEach(n=>n.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&=this._$Eq.forEach(n=>this._$ET(n,this[n])),this._$EM()}updated(e){}firstUpdated(e){}};U.elementStyles=[],U.shadowRootOptions={mode:"open"},U[Oe("elementProperties")]=new Map,U[Oe("finalized")]=new Map,qo?.({ReactiveElement:U}),(nt.reactiveElementVersions??=[]).push("2.1.2");var on=globalThis,_i=t=>t,it=on.trustedTypes,bi=it?it.createPolicy("lit-html",{createHTML:t=>t}):void 0,sn="$lit$",W=`lit$${Math.random().toFixed(9).slice(2)}$`,an="?"+W,Yo=`<${an}>`,se=document,Pe=()=>se.createComment(""),Ne=t=>t===null||typeof t!="object"&&typeof t!="function",ln=Array.isArray,$i=t=>ln(t)||typeof t?.[Symbol.iterator]=="function",rn=`[ 	
\f\r]`,Fe=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,wi=/-->/g,vi=/>/g,re=RegExp(`>|${rn}(?:([^\\s"'>=/]+)(${rn}*=${rn}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),yi=/'/g,xi=/"/g,Si=/^(?:script|style|textarea|title)$/i,dn=t=>(e,...n)=>({_$litType$:t,strings:e,values:n}),c=dn(1),cn=dn(2),dd=dn(3),Z=Symbol.for("lit-noChange"),u=Symbol.for("lit-nothing"),ki=new WeakMap,oe=se.createTreeWalker(se,129);function Ci(t,e){if(!ln(t)||!t.hasOwnProperty("raw"))throw Error("invalid template strings array");return bi!==void 0?bi.createHTML(e):e}var Ti=(t,e)=>{let n=t.length-1,i=[],r,o=e===2?"<svg>":e===3?"<math>":"",a=Fe;for(let d=0;d<n;d++){let l=t[d],p,h,f=-1,g=0;for(;g<l.length&&(a.lastIndex=g,h=a.exec(l),h!==null);)g=a.lastIndex,a===Fe?h[1]==="!--"?a=wi:h[1]!==void 0?a=vi:h[2]!==void 0?(Si.test(h[2])&&(r=RegExp("</"+h[2],"g")),a=re):h[3]!==void 0&&(a=re):a===re?h[0]===">"?(a=r??Fe,f=-1):h[1]===void 0?f=-2:(f=a.lastIndex-h[2].length,p=h[1],a=h[3]===void 0?re:h[3]==='"'?xi:yi):a===xi||a===yi?a=re:a===wi||a===vi?a=Fe:(a=re,r=void 0);let _=a===re&&t[d+1].startsWith("/>")?" ":"";o+=a===Fe?l+Yo:f>=0?(i.push(p),l.slice(0,f)+sn+l.slice(f)+W+_):l+W+(f===-2?d:_)}return[Ci(t,o+(t[n]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),i]},Ve=class t{constructor({strings:e,_$litType$:n},i){let r;this.parts=[];let o=0,a=0,d=e.length-1,l=this.parts,[p,h]=Ti(e,n);if(this.el=t.createElement(p,i),oe.currentNode=this.el.content,n===2||n===3){let f=this.el.content.firstChild;f.replaceWith(...f.childNodes)}for(;(r=oe.nextNode())!==null&&l.length<d;){if(r.nodeType===1){if(r.hasAttributes())for(let f of r.getAttributeNames())if(f.endsWith(sn)){let g=h[a++],_=r.getAttribute(f).split(W),m=/([.?@])?(.*)/.exec(g);l.push({type:1,index:o,name:m[2],strings:_,ctor:m[1]==="."?ot:m[1]==="?"?st:m[1]==="@"?at:le}),r.removeAttribute(f)}else f.startsWith(W)&&(l.push({type:6,index:o}),r.removeAttribute(f));if(Si.test(r.tagName)){let f=r.textContent.split(W),g=f.length-1;if(g>0){r.textContent=it?it.emptyScript:"";for(let _=0;_<g;_++)r.append(f[_],Pe()),oe.nextNode(),l.push({type:2,index:++o});r.append(f[g],Pe())}}}else if(r.nodeType===8)if(r.data===an)l.push({type:2,index:o});else{let f=-1;for(;(f=r.data.indexOf(W,f+1))!==-1;)l.push({type:7,index:o}),f+=W.length-1}o++}}static createElement(e,n){let i=se.createElement("template");return i.innerHTML=e,i}};function ae(t,e,n=t,i){if(e===Z)return e;let r=i!==void 0?n._$Co?.[i]:n._$Cl,o=Ne(e)?void 0:e._$litDirective$;return r?.constructor!==o&&(r?._$AO?.(!1),o===void 0?r=void 0:(r=new o(t),r._$AT(t,n,i)),i!==void 0?(n._$Co??=[])[i]=r:n._$Cl=r),r!==void 0&&(e=ae(t,r._$AS(t,e.values),r,i)),e}var rt=class{constructor(e,n){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=n}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){let{el:{content:n},parts:i}=this._$AD,r=(e?.creationScope??se).importNode(n,!0);oe.currentNode=r;let o=oe.nextNode(),a=0,d=0,l=i[0];for(;l!==void 0;){if(a===l.index){let p;l.type===2?p=new ge(o,o.nextSibling,this,e):l.type===1?p=new l.ctor(o,l.name,l.strings,this,e):l.type===6&&(p=new lt(o,this,e)),this._$AV.push(p),l=i[++d]}a!==l?.index&&(o=oe.nextNode(),a++)}return oe.currentNode=se,r}p(e){let n=0;for(let i of this._$AV)i!==void 0&&(i.strings!==void 0?(i._$AI(e,i,n),n+=i.strings.length-2):i._$AI(e[n])),n++}},ge=class t{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(e,n,i,r){this.type=2,this._$AH=u,this._$AN=void 0,this._$AA=e,this._$AB=n,this._$AM=i,this.options=r,this._$Cv=r?.isConnected??!0}get parentNode(){let e=this._$AA.parentNode,n=this._$AM;return n!==void 0&&e?.nodeType===11&&(e=n.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,n=this){e=ae(this,e,n),Ne(e)?e===u||e==null||e===""?(this._$AH!==u&&this._$AR(),this._$AH=u):e!==this._$AH&&e!==Z&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):$i(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==u&&Ne(this._$AH)?this._$AA.nextSibling.data=e:this.T(se.createTextNode(e)),this._$AH=e}$(e){let{values:n,_$litType$:i}=e,r=typeof i=="number"?this._$AC(e):(i.el===void 0&&(i.el=Ve.createElement(Ci(i.h,i.h[0]),this.options)),i);if(this._$AH?._$AD===r)this._$AH.p(n);else{let o=new rt(r,this),a=o.u(this.options);o.p(n),this.T(a),this._$AH=o}}_$AC(e){let n=ki.get(e.strings);return n===void 0&&ki.set(e.strings,n=new Ve(e)),n}k(e){ln(this._$AH)||(this._$AH=[],this._$AR());let n=this._$AH,i,r=0;for(let o of e)r===n.length?n.push(i=new t(this.O(Pe()),this.O(Pe()),this,this.options)):i=n[r],i._$AI(o),r++;r<n.length&&(this._$AR(i&&i._$AB.nextSibling,r),n.length=r)}_$AR(e=this._$AA.nextSibling,n){for(this._$AP?.(!1,!0,n);e!==this._$AB;){let i=_i(e).nextSibling;_i(e).remove(),e=i}}setConnected(e){this._$AM===void 0&&(this._$Cv=e,this._$AP?.(e))}},le=class{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,n,i,r,o){this.type=1,this._$AH=u,this._$AN=void 0,this.element=e,this.name=n,this._$AM=r,this.options=o,i.length>2||i[0]!==""||i[1]!==""?(this._$AH=Array(i.length-1).fill(new String),this.strings=i):this._$AH=u}_$AI(e,n=this,i,r){let o=this.strings,a=!1;if(o===void 0)e=ae(this,e,n,0),a=!Ne(e)||e!==this._$AH&&e!==Z,a&&(this._$AH=e);else{let d=e,l,p;for(e=o[0],l=0;l<o.length-1;l++)p=ae(this,d[i+l],n,l),p===Z&&(p=this._$AH[l]),a||=!Ne(p)||p!==this._$AH[l],p===u?e=u:e!==u&&(e+=(p??"")+o[l+1]),this._$AH[l]=p}a&&!r&&this.j(e)}j(e){e===u?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}},ot=class extends le{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===u?void 0:e}},st=class extends le{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==u)}},at=class extends le{constructor(e,n,i,r,o){super(e,n,i,r,o),this.type=5}_$AI(e,n=this){if((e=ae(this,e,n,0)??u)===Z)return;let i=this._$AH,r=e===u&&i!==u||e.capture!==i.capture||e.once!==i.once||e.passive!==i.passive,o=e!==u&&(i===u||r);r&&this.element.removeEventListener(this.name,this,i),o&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,e):this._$AH.handleEvent(e)}},lt=class{constructor(e,n,i){this.element=e,this.type=6,this._$AN=void 0,this._$AM=n,this.options=i}get _$AU(){return this._$AM._$AU}_$AI(e){ae(this,e)}},Ai={M:sn,P:W,A:an,C:1,L:Ti,R:rt,D:$i,V:ae,I:ge,H:le,N:st,U:at,B:ot,F:lt},Jo=on.litHtmlPolyfillSupport;Jo?.(Ve,ge),(on.litHtmlVersions??=[]).push("3.3.3");var zi=(t,e,n)=>{let i=n?.renderBefore??e,r=i._$litPart$;if(r===void 0){let o=n?.renderBefore??null;i._$litPart$=r=new ge(e.insertBefore(Pe(),o),o,void 0,n??{})}return r._$AI(t),r};var pn=globalThis,j=class extends U{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){let e=super.createRenderRoot();return this.renderOptions.renderBefore??=e.firstChild,e}update(e){let n=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=zi(n,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return Z}};j._$litElement$=!0,j.finalized=!0,pn.litElementHydrateSupport?.({LitElement:j});var Xo=pn.litElementPolyfillSupport;Xo?.({LitElement:j});(pn.litElementVersions??=[]).push("4.2.2");var Di={picker_name:"BamBuddy-Drucker",picker_description:"Zeigt und steuert einen Drucker aus BamBuddy: Fortschritt, Kamera, Temperaturen, Filament und Achsen bewegen.",no_printer:"W\xE4hle in den Einstellungen der Karte einen Drucker.",not_found:"Dieser Drucker ist nicht mehr verf\xFCgbar. W\xE4hle ihn in den Einstellungen der Karte neu aus \u2013 oder einen anderen.",not_a_printer:"Dieses Ger\xE4t ist kein BamBuddy-Drucker. W\xE4hle einen Drucker, keine AMS-Einheit, keine Steckdose und nicht den BamBuddy-Server.",waiting_for_printer:"Warte auf die Daten des Druckers \u2026",invalid_option:"Ung\xFCltiger Wert f\xFCr \u201E{option}\u201C: {value}. Erlaubt: {allowed}.",allowed_device:"die ID eines Drucker-Ger\xE4ts",editor_unavailable:"Der visuelle Editor wurde nicht geladen. Bearbeite die Karte im Code-Editor (\u201ECode-Editor anzeigen\u201C).",editor_printer:"Drucker",editor_printer_help:"Ein Drucker der BamBuddy-Integration, keine AMS-Einheit.",editor_camera:"Livebild",editor_camera_help:"Nach Antippen: Ein Tipp aufs Kamera-Symbol am Bild startet es. Immer: Es l\xE4uft, solange das Dashboard offen ist, und braucht dauernd Bandbreite. Nie: nur das Bild des Druckauftrags.",camera_tap:"Nach Antippen",camera_always:"Immer",cover_open:"Vorschaubild gro\xDF anzeigen",cover_close:"Vorschaubild schlie\xDFen",camera_off:"Nie",allowed_list:"eine Liste aus {values}",editor_group_general:"Allgemein",editor_start_hidden:"Achtung: Der Tab \u201E{tab}\u201C ist ausgeblendet. Die Karte \xF6ffnet mit \u201EStatus\u201C.",editor_group_status:"Status",editor_group_control:"Steuerung",editor_group_filament:"Filament",editor_blocks:"Bereich hinzuf\xFCgen",editor_blocks_help:"Die Bereiche im Tab \u201EStatus\u201C unter dem Druckauftrag. Ziehe einen Bereich an die gew\xFCnschte Stelle; \xD7 blendet ihn aus. Drucksteuerung und Druckgeschwindigkeit erscheinen nur w\xE4hrend eines Drucks, Strom nur, wenn BamBuddy dem Drucker eine Steckdose zuordnet.",sample_job:"Beispiel \u2013 erscheint w\xE4hrend eines Drucks",sample_offline:"Beispiel \u2013 erscheint, sobald der Drucker online ist",sample_unreachable:"Beispiel \u2013 erscheint, sobald BamBuddy antwortet",block_controls:"Drucksteuerung",block_temperatures:"Temperaturen",block_ams:"AMS und Filament",block_fans:"L\xFCfter",block_speed:"Druckgeschwindigkeit",editor_chips:"Chip hinzuf\xFCgen",editor_chips_help:"Die Chips unter dem Namen. Ziehe einen Chip an die gew\xFCnschte Stelle; \xD7 blendet ihn aus. T\xFCr, SD-Karte / USB-Stick und Trocknen erscheinen nur, wenn die T\xFCr offen ist, der Speicher fehlt oder ein AMS trocknet; Strom nur mit einer Steckdose. Eine HMS-Fehlermeldung zeigt die Karte immer.",chip_network:"Netzwerk",chip_hms:"HMS",chip_firmware:"Firmware",chip_maintenance:"Wartung",chip_door:"T\xFCr",chip_storage:"SD-Karte / USB-Stick",chip_drying:"Trocknen",editor_start_view:"Tab beim \xD6ffnen",editor_control_tab:"Tab \u201ESteuerung\u201C",editor_control_tab_help:"Blendet den Tab mit Heizen und L\xFCften, Druckoptionen, Achsen und Extruder ein oder aus.",editor_sections:"Bereich hinzuf\xFCgen",editor_sections_help:"Die Bereiche im Tab \u201ESteuerung\u201C. Ziehe einen Bereich an die gew\xFCnschte Stelle; \xD7 blendet ihn aus.",section_heating:"Heizen und L\xFCften",section_options:"Druckoptionen",section_motion:"Achsen und Extruder",editor_read_only:"Steuerelemente ausblenden",editor_read_only_help:"Zeigt den Drucker nur an: Licht, Heizen, L\xFCften und Druckoptionen als Zustand, ohne Kn\xF6pfe; Druck- und Filamentkn\xF6pfe, Trocknen, die Schalter der Steckdosen sowie Achsen und Extruder fallen weg. Keine Sperre: Aktionen, Automationen und die Ger\xE4teseite steuern ihn weiter.",editor_filament_tab:"Tab \u201EFilament\u201C",editor_filament_tab_help:"Blendet den Tab mit den AMS-Einheiten und der externen Spule ein oder aus \u2013 zum Laden, Entladen, Festlegen und Trocknen des Filaments.",editor_ams_folding:"AMS-Einheiten",editor_ams_folding_help:"Eingeklappt zeigt jede Einheit ohne ihre F\xE4cher; ein Tipp klappt sie auf.",editor_external_spool:"Externe Spule anzeigen",editor_external_spool_help:"Blendet die externe Spule in den Tabs \u201EStatus\u201C und \u201EFilament\u201C ein oder aus. Das Ausblenden wirkt nur bei einem Drucker mit AMS; solange der Drucker von der externen Spule druckt, zeigt die Karte sie trotzdem.",editor_compact_chips:"Kompakte Chips",editor_compact_chips_help:"Kurze Texte in den Chips: Symbol und Wert, z. B. \u201EOK\u201C statt \u201EHMS OK\u201C. Der volle Text steht im Tooltip und wird von Screenreadern vorgelesen.",folding_auto:"Automatisch (ab 3 eingeklappt)",folding_folded:"Eingeklappt",folding_open:"Ausgeklappt",tab_status:"Status",tab_control:"Steuerung",tab_filament:"Filament",aria_views:"Ansichten",online:"Online",offline:"Offline",light:"Kammerbeleuchtung",light_plain:"Licht",dismiss:"Schlie\xDFen",error_dismiss:"Fehlermeldung schlie\xDFen",cancel:"Abbrechen",error_generic:"Das hat nicht geklappt. Versuche es gleich noch einmal.",sent:"Gesendet",ams_activity:"AMS: {state}",more:"Weitere Optionen",menu_device_page:"Ger\xE4teseite \xF6ffnen",menu_info:"Druckerinformationen",menu_refresh:"Status aktualisieren",menu_maintenance:"Wartung",check_connection:"Verbindung pr\xFCfen",wifi:"WLAN",wifi_signal:"Netzwerk: WLAN, {value}, {quality}",wifi_good:"gut",wifi_fair:"mittel",wifi_weak:"schwach",lan:"LAN",lan_aria:"Netzwerk: LAN (Kabel)",lan_wired:"LAN (Kabel)",hms_ok:"HMS OK",chip_ok:"OK",hms_pill_aria:"{count} HMS-Meldungen",hms_pill_aria_one:"1 HMS-Meldung",hms_pill_none:"HMS OK \u2013 keine Meldungen",hms_title:"Meldungen des Druckers (HMS)",hms_none_dialog:"Keine Meldungen. HMS ist das Warnsystem des Druckers.",hms_next:"Pr\xFCfe den Druck. Setze ihn danach fort oder stoppe ihn.",hms_next_elsewhere:"Pr\xFCfe den Druck. Setze ihn danach am Drucker oder in BamBuddy fort oder stoppe ihn dort.",hms_next_read:"Pr\xFCfe den Druck. Setze ihn danach am Drucker, in BamBuddy oder in Home Assistant fort oder stoppe ihn dort.",hms_more:"+{n} weitere",hms_clear_note:"L\xF6schen entfernt nur die Meldung: Fehler, die der Drucker weiter sieht, meldet er erneut.",firmware:"Firmware",firmware_update:"Firmware {version}: Update verf\xFCgbar",firmware_update_label:"Update {latest} verf\xFCgbar, installiert ist Firmware {version}",firmware_update_chip:"Update {version}",firmware_offline:"Firmware {version} (Drucker offline)",firmware_unreachable:"Firmware {version} (keine Daten von BamBuddy)",firmware_current:"Firmware {version}: aktuell",firmware_version:"Firmware {version}",firmware_installed:"Installiert",firmware_latest:"Neueste",firmware_available:"Verf\xFCgbar",firmware_notes:"Versionshinweise",firmware_note:"Installiere Updates am Drucker, in Bambu Handy oder in BamBuddy.",info_model:"Modell",info_name:"Name in BamBuddy",info_server:"BamBuddy-Server",info_status:"Status",info_print_status:"Druckstatus",info_ip:"IP-Adresse",info_serial:"Seriennummer",info_network:"Netzwerk",info_developer:"Entwicklermodus",info_nozzle:"D\xFCse",info_nozzles:"D\xFCsen",info_hours:"Druckstunden",info_on:"An",info_off:"Aus",info_developer_note:"Der Drucker nimmt keine Befehle an.",nozzle_side:"{side}: {nozzle}",copy_ip:"IP-Adresse kopieren",copy_serial:"Seriennummer kopieren",copied:"Kopiert",no_job:"Kein Druck aktiv",offline_text:"Der Drucker ist offline. Pr\xFCfe, ob er eingeschaltet und mit BamBuddy verbunden ist.",unreachable_text:"Keine Daten von BamBuddy. Pr\xFCfe, ob BamBuddy l\xE4uft, und unter Einstellungen \u2192 Ger\xE4te & Dienste, ob BamBuddy einen neuen API-Schl\xFCssel braucht.",unreachable_text_user:"Keine Daten von BamBuddy. Pr\xFCfe, ob BamBuddy l\xE4uft; vielleicht muss eine Administratorin oder ein Administrator einen neuen API-Schl\xFCssel eingeben.",unreachable_short:"Keine Daten von BamBuddy",missing_text:"BamBuddy f\xFChrt diesen Drucker nicht mehr. Unter Einstellungen \u2192 Reparaturen kannst du ihn entfernen; f\xFChrt BamBuddy ihn wieder, erscheint er hier von selbst.",missing_text_user:"BamBuddy f\xFChrt diesen Drucker nicht mehr. F\xFChrt BamBuddy ihn wieder, erscheint er hier von selbst.",missing_short:"Nicht mehr in BamBuddy",layer:"Schicht {current} / {total}",remaining:"noch {time}",ends:"Ende {time}",progress:"Fortschritt",live:"Livebild",live_badge:"Live",live_stop:"Livebild schlie\xDFen",fullscreen_open:"Vollbild",fullscreen_close:"Vollbild verlassen",camera_failed:"Die Kamera ist nicht verf\xFCgbar.",fps_value:"{fps} fps",fps_aria:"{fps} Bilder pro Sekunde",fps_measuring:"Bildrate wird gemessen",fps_open:"Bildrate einstellen",fps_title:"Bildrate der Kamera",fps_lower:"{step} Bilder pro Sekunde weniger",fps_raise:"{step} Bilder pro Sekunde mehr",fps_note:"Diese Kamera schafft bis zu {max} Bilder pro Sekunde; einstellbar sind {min} bis {max} in Schritten von {step}. Die Bildrate gilt f\xFCr diesen Drucker in ganz Home Assistant \u2013 in jedem Dashboard und auf jedem Handy oder Computer. Schaut gerade jemand anderes zu, etwa in BamBuddy selbst, kann BamBuddy bei dessen Bildrate bleiben \u2013 deine gilt dann ab dem n\xE4chsten \xD6ffnen des Livebilds, wenn sonst niemand zuschaut. Der Chip im Livebild zeigt, was ankommt.",retry:"Erneut versuchen",nozzle:"D\xFCse",nozzle_left:"Linke D\xFCse",nozzle_right:"Rechte D\xFCse",bed:"Bett",chamber:"Kammer",heater_off:"Aus",target:"Ziel {value}",fan_part:"Bauteil",fan_aux:"Zusatz",fan_chamber:"Kammer",fan_exhaust:"Abluft",fan_left_aux:"Linker Zusatz",fan_right_aux:"Rechter Zusatz",fan_hotend:"Hotend",fan_part_name:"Bauteill\xFCfter",fan_aux_name:"Zusatzl\xFCfter",fan_chamber_name:"Kammerl\xFCfter",fan_exhaust_name:"Abluftl\xFCfter",fan_left_aux_name:"Linker Zusatzl\xFCfter",fan_right_aux_name:"Rechter Zusatzl\xFCfter",fan_hotend_name:"Hotend-L\xFCfter",fan_off:"Aus",fans:"L\xFCfter",open_filament:"Filament-Ansicht \xF6ffnen",strip_unit:"{name}: {slots}",strip_humidity:"Feuchte {humidity}",strip_temperature:"Temperatur {temperature}",side_left_short:"L",side_right_short:"R",external_short:"Ext",hms_error:"Fehler",hms_warning:"Warnung",hms_notice:"Hinweis",hms_no_text:"{severity}: BamBuddy hat keinen Text zu diesem Code.",hms_answer_resume_printing:"Druck fortsetzen",hms_answer_resume_printing_defects:"Fortsetzen (M\xE4ngel akzeptabel)",hms_answer_resume_printing_probelm_solved:"Fortsetzen (Problem gel\xF6st)",hms_answer_problem_solved_resume:"Problem gel\xF6st, fortsetzen",hms_answer_filament_load_resume:"Filament geladen, fortsetzen",hms_answer_proceed:"Fortfahren",hms_answer_dbl_check_resume:"Fortsetzen",hms_answer_stop_printing:"Druck stoppen",hms_answer_ignore_resume:"Ignorieren und fortsetzen",hms_answer_ignore_no_reminder_next_time:"Ignorieren, nicht mehr erinnern",hms_answer_dont_remind_next_time:"Nicht mehr erinnern",hms_answer_no_reminder_next_time:"Nicht mehr erinnern",hms_answer_filament_extruded:"Filament extrudiert, weiter",hms_answer_dbl_check_done:"Fertig",hms_answer_retry_filament_extruded:"Noch nicht extrudiert, erneut versuchen",hms_answer_continue:"Fertig, weiter",hms_answer_retry_problem_solved:"Erneut versuchen (Problem gel\xF6st)",hms_answer_dbl_check_retry:"Erneut versuchen",hms_answer_abort:"Abbrechen",hms_answer_ok_button:"OK",hms_answer_dbl_check_ok:"Best\xE4tigen",hms_answer_refresh_nozzle:"Erneut pr\xFCfen",hms_answer_turn_off_fire_alarm:"Brandalarm ausschalten",hms_answer_stop_drying:"Trocknen stoppen",hms_answer_disable_purification:"Keine Luftreinigung bei diesem Druck",hms_wiki:"HMS-Codes im Bambu-Lab-Wiki",hms_unknown:"HMS-Meldung",hms_count:"HMS-Fehler: {count}",hms_clear:"HMS-Fehler l\xF6schen",plate_text:"Nimm den Druck von der Platte und tippe dann auf \u201EDruckplatte ger\xE4umt\u201C. BamBuddy startet den n\xE4chsten Druck aus der Warteschlange erst danach.",plate_text_read:"Nimm den Druck von der Platte. BamBuddy startet den n\xE4chsten Druck aus der Warteschlange erst, wenn das best\xE4tigt ist: in BamBuddy oder mit \u201EDruckplatte ger\xE4umt\u201C in Home Assistant.",plate_text_bambuddy:"Nimm den Druck von der Platte. BamBuddy startet den n\xE4chsten Druck aus der Warteschlange erst, wenn das in BamBuddy best\xE4tigt ist.",plate_cleared:"Druckplatte ger\xE4umt",pause:"Druck pausieren",resume:"Druck fortsetzen",paused_empty:"Kein Filament geladen. Lade eines im Tab \u201EFilament\u201C, bevor du fortsetzt.",paused_empty_no_tab:"Kein Filament geladen. Lade eines, bevor du fortsetzt.",stop:"Druck stoppen",speed:"Druckgeschwindigkeit",developer_off:"Der Drucker nimmt keine Befehle an: Sein Entwicklermodus (LAN) ist aus. Schalte ihn am Display des Druckers unter Einstellungen \u2192 Netzwerk (oder WLAN) ein: erst \u201ELAN Only Mode\u201C, dann \u201EDeveloper Mode\u201C. Trage danach den neuen Zugangscode in BamBuddy ein.",stop_title:"Druck stoppen?",stop_text:"Der Druck l\xE4sst sich danach nicht fortsetzen.",stop_keep:"Weiterdrucken",stop_confirm:"Druck stoppen",skip:"Objekte \xFCberspringen",skip_one:"1 Objekt \xFCberspringen",skip_many:"{count} Objekte \xFCberspringen",skip_text:"\xDCbersprungene Objekte werden in diesem Druck nicht mehr gedruckt. Das l\xE4sst sich nicht r\xFCckg\xE4ngig machen.",skip_loading:"Objekte werden geladen \u2026",skip_none_listed:"BamBuddy kennt keine Objekte dieses Drucks.",skip_object:"Objekt {id}",skip_skipped:"\xDCbersprungen",skip_all:"Um alle Objekte zu \xFCberspringen, stoppe stattdessen den Druck.",skip_single:"Dieser Druck hat nur ein Objekt. Um es nicht zu drucken, stoppe den Druck.",heating:"Heizen",heat_now:"Jetzt {value}",heat_lower:"{what} {step}\xA0{unit} k\xFChler",heat_raise:"{what} {step}\xA0{unit} w\xE4rmer",heat_start:"{what} auf {value} heizen",heat_off:"{what} ausschalten",active_nozzle:"Aktive D\xFCse",nozzle_active:"aktiv",step:"Schritt",move:"{axis} um {distance} mm bewegen",home:"Referenzfahrt",slot_named:"{shown} \u2013 {place}",external_left_place:"Linke externe Spule",external_right_place:"Rechte externe Spule",heat_target_said:"{what}, Ziel:",hours_long:"Stunden",home_aria:"Alle Achsen referenzieren",maint_marked:"\u201E{task}\u201C als erledigt markiert.",home_title:"Alle Achsen referenzieren?",home_text:"Der Druckkopf f\xE4hrt in seine Ausgangsposition; nimm vorher alles von der Druckplatte.",bed_axis:"Bett",bed_closer:"N\xE4her",bed_away:"Weiter weg",bed_closer_aria:"Bett {step} mm n\xE4her an die D\xFCse",bed_away_aria:"Bett {step} mm weiter weg von der D\xFCse",nozzle_height:"D\xFCsenh\xF6he",nozzle_closer_aria:"D\xFCse {step} mm n\xE4her ans Bett",nozzle_away_aria:"D\xFCse {step} mm weiter weg vom Bett",extruder:"Extruder",extrude:"Extrudieren",retract:"Zur\xFCckziehen",extrude_aria:"{length} mm Filament extrudieren",retract_aria:"{length} mm Filament zur\xFCckziehen",cold_nozzle:"Zum Extrudieren heize die D\xFCse unter \u201EHeizen\u201C auf mindestens {temperature}.",cold_nozzle_left:"Zum Extrudieren heize die linke D\xFCse (aktiv) unter \u201EHeizen\u201C auf mindestens {temperature}.",cold_nozzle_right:"Zum Extrudieren heize die rechte D\xFCse (aktiv) unter \u201EHeizen\u201C auf mindestens {temperature}.",cold_nozzle_plain:"Zum Extrudieren muss die D\xFCse mindestens {temperature} hei\xDF sein.",cold_nozzle_left_plain:"Zum Extrudieren muss die linke D\xFCse (aktiv) mindestens {temperature} hei\xDF sein.",cold_nozzle_right_plain:"Zum Extrudieren muss die rechte D\xFCse (aktiv) mindestens {temperature} hei\xDF sein.",jog_note:"Tippe zuerst auf das Haus, damit der Drucker seine Position kennt. Beim Bewegen mit den Pfeilen stoppt er nicht am Rand des Bauraums: Ein gro\xDFer Schritt kann anschlagen. W\xE4hle in der N\xE4he des Rands einen kleinen Schritt.",busy_reason:"Bewegen und Extrudieren sind m\xF6glich, sobald der Druck fertig ist.",changing_reason:"Warte, bis der Filamentwechsel fertig ist.",changing_paused:"Warte, bis der Filamentwechsel fertig ist, dann setze den Druck fort.",detection:"Druckoptionen",detection_all_on:"Alle an",detection_off:"{off} aus",detection_all_off:"Alle aus",detection_hint:"An: Der Drucker pausiert den Druck, wenn die Erkennung anschl\xE4gt. Empfindlichkeit wie am Drucker eingestellt. Eine ausgeschaltete Erkennung bleibt aus, auch bei den n\xE4chsten Drucken.",detection_hint_plain:"An: Der Drucker pausiert den Druck, wenn die Erkennung anschl\xE4gt. Eine ausgeschaltete Erkennung bleibt aus, auch bei den n\xE4chsten Drucken.",detection_ai_monitoring:"KI-Druck\xFCberwachung",detection_ai_monitoring_x1:"Spaghetti und Stau im Auswurfschacht",detection_first_layer_inspection:"Inspektion der ersten Schicht",detection_build_plate_detection:"Druckplattenerkennung",detection_build_plate_position_detection:"Positionserkennung der Druckplatte",detection_spaghetti_detection:"Spaghetti-Erkennung",detection_pileup_detection:"Auswurfschacht-\xDCberwachung",detection_clumping_detection:"Erkennung von D\xFCsenklumpen",detection_air_printing_detection:"Druck-ins-Leere-Erkennung",external:"Externe Spule",externals:"Externe Spulen",left:"Links",right:"Rechts",humidity:"Feuchte",temperature:"Temperatur",empty:"Leer",not_set:"Nicht festgelegt",unknown:"Unbekannt",in_use:"In Gebrauch",inv_tabs:"Wie das Fach eingestellt wird",inv_tab_set:"Filament einstellen",inv_tab_inventory:"Aus dem Inventar",inv_from:"Zugewiesene Spule aus dem Inventar",inv_no:"Nr. {id}",inv_warn_change:"\xDCbernehmen hebt die Zuweisung von {name} auf.",inv_note_change:"Eine andere Farbe oder ein anderer Typ (z. B. PETG statt PLA) hebt die Zuweisung der Spule auf.",inv_loading:"BamBuddys Spulen werden gelesen \u2026",inv_failed:"Das Inventar lie\xDF sich nicht lesen. Um neu zu fragen, schlie\xDFe den Dialog und \xF6ffne ihn noch einmal.",inv_vendor:"Hersteller",inv_material:"Material",inv_all:"Alle",inv_search:"Suchen (Name, Farbe, Nr.)",inv_choose:"Spule w\xE4hlen",inv_here:"Zugewiesen: dieses Fach",inv_in_slot:"Zugewiesen: {unit}, Fach {slot}",inv_in_unit:"Zugewiesen: {unit}",inv_ext:"Zugewiesen: externe Spule",inv_ext_left:"Zugewiesen: externe Spule (links)",inv_ext_right:"Zugewiesen: externe Spule (rechts)",inv_other:"Zugewiesen: {printer}, {where}",inv_other_slot:"{unit}, Fach {slot}",inv_other_ext:"externe Spule",inv_other_ext_left:"externe Spule (links)",inv_at_printer:"{printer}, {where}",inv_other_ext_right:"externe Spule (rechts)",inv_from_ext:"der externen Spule",inv_from_ext_left:"der externen Spule (links)",inv_from_ext_right:"der externen Spule (rechts)",inv_from_printer:"dem Drucker {printer}, {where}",inv_not_nozzle:"Nicht f\xFCr diese D\xFCse",inv_not_ams:"Nicht f\xFCr das AMS",inv_printing:"Gesperrt, solange {printer} druckt.",inv_warn_material:"Die Spule ist {material}, das Fach ist auf {slot} eingestellt. Zuweisen stellt das Fach auf {material} um.",inv_warn_material_printing:"{printer} druckt gerade aus diesem Fach ({slot}). Zuweisen stellt es mitten im Druck auf {material} um.",inv_by_chip:"Verkn\xFCpft sich \xFCber ihren Chip",inv_not_printer:"Nicht f\xFCr diesen Drucker",inv_takes_from:"Zuweisen nimmt die Spule aus {where}.",inv_no_hit:"Keine Spule passt zur Suche.",inv_empty_slot:"Das Fach ist leer. BamBuddy stellt es ein, sobald die Spule drin ist.",inv_unassign:"Zuweisung aufheben",inv_assign:"Zuweisen",inv_busy_change:"{printer} wechselt gerade das Filament.",inv_location:"Lagerort",inv_stored:"Lagerort: {location}",inv_also:"Auch zugewiesen: {where}",inv_waiting:"Wartet auf die Spule",inv_strip_waiting:"{empty} \xB7 {name} wartet",load:"Laden",unload:"Entladen",load_title_from:"{filament} aus {place} laden?",load_title_external:"{filament} von der externen Spule laden?",load_title_left:"{filament} von der linken externen Spule laden?",load_title_right:"{filament} von der rechten externen Spule laden?",load_text:"Der Drucker heizt die D\xFCse, entl\xE4dt das aktuelle Filament und l\xE4dt dieses. Das dauert einige Minuten.",load_text_left:"Der Drucker heizt die linke D\xFCse, entl\xE4dt ihr Filament und l\xE4dt dieses. Das dauert einige Minuten.",load_text_right:"Der Drucker heizt die rechte D\xFCse, entl\xE4dt ihr Filament und l\xE4dt dieses. Das dauert einige Minuten.",unload_text_left:"Der Drucker heizt die linke D\xFCse und zieht ihr Filament zur\xFCck.",unload_text_right:"Der Drucker heizt die rechte D\xFCse und zieht ihr Filament zur\xFCck.",strip_nozzle_left:"linke D\xFCse",strip_nozzle_right:"rechte D\xFCse",unload_title:"Filament entladen?",unload_text:"Der Drucker heizt die D\xFCse und zieht das Filament zur\xFCck.",ht_load:"Lade Filament aus dem AMS HT am Display des Druckers.",filament_pause:"Pausiere den Druck, um das Filament zu wechseln.",filament_paused:"Druck pausiert: Du kannst das Filament jetzt wechseln.",filament_paused_fault:"Der Drucker hat den Druck angehalten: K\xFCmmere dich zuerst um seine Meldung. Du kannst hier das Filament wechseln und dann fortsetzen.",paused_change:"Der Druck bleibt pausiert. Setze ihn fort, wenn das neue Filament drin ist.",drying:"Trocknet \xB7 noch\xA0{time}",dry_at_printer:"Starte und stoppe das Trocknen am Display des Druckers.",drying_now:"Trocknet",drying_at:"Trocknet bei {temperature} \xB7 noch\xA0{time}",drying_now_at:"Trocknet bei {temperature}",not_drying:"Trocknet nicht",dry:"Trocknen",dry_stop:"Trocknen stoppen",dry_stop_title:"Trocknen stoppen?",dry_stop_text:"{unit} trocknet noch {time} lang.",dry_stop_now:"{unit} h\xF6rt dann auf zu trocknen.",dry_keep:"Weiter trocknen",dry_title:"Filament in {unit} trocknen",dry_temperature:"Temperatur",dry_duration:"Dauer",dry_start:"Trocknen starten",dry_suggested:"Empfehlung f\xFCr das geladene Filament.",dry_suggested_for:"Empfehlung f\xFCr das geladene Filament: {filaments}.",dry_mixed:"F\xFCr die empfindlichste Spule eingestellt: {spools}",dry_temperature_lower:"Temperatur senken",dry_temperature_raise:"Temperatur erh\xF6hen",dry_duration_lower:"Trocknen verk\xFCrzen",dry_duration_raise:"Trocknen verl\xE4ngern",set_filament:"Filament festlegen",edit_slot:"{slot} bearbeiten",edit_external:"Externe Spule bearbeiten",edit_external_left:"Linke externe Spule bearbeiten",edit_external_right:"Rechte externe Spule bearbeiten",slot_label:"Fach {slot} \xB7 {unit}",filament_title:"Filament von {slot}",filament_title_external:"Filament der externen Spule",filament_title_left:"Filament der linken externen Spule",filament_title_right:"Filament der rechten externen Spule",vendor:"Hersteller",filament_field:"Filament",profile_title:"Profil des Fachs",profile_help:"Die Profile, die Bambu Studio mitbringt, passend zu diesem Drucker, seiner D\xFCse und diesem Fach. Eigene Profile sind nicht dabei; die setzt du am Drucker oder in BamBuddy.",profile_keep:"Bisheriges Profil behalten",profile_own:"Eigenes Profil, das Bambu Studios Liste nicht kennt ({type}).",profile_none:"Kein Profil gesetzt ({type}).",profile_current:"Bisheriges Profil: {name}.",material_keep:"{name} behalten",material_choose:"W\xE4hlen \u2026",color:"Farbe",color_other:"Andere Farbe \u2026",color_current:"Aktuelle Farbe",color_chosen:"Gew\xE4hlte Farbe",color_white:"Wei\xDF",color_black:"Schwarz",color_gray:"Grau",color_silver:"Silber",color_red:"Rot",color_orange:"Orange",color_yellow:"Gelb",color_green:"Gr\xFCn",color_turquoise:"T\xFCrkis",color_cyan:"Cyan",color_blue:"Blau",color_purple:"Lila",color_pink:"Pink",color_brown:"Braun",color_beige:"Beige",color_gold:"Gold",offer_empty:"Bambu Studio bietet f\xFCr dieses Fach mit der D\xFCse, die es versorgt, kein Filament an. Ein Profil kannst du am Drucker oder in BamBuddy setzen.",offer_failed:"Die Filamentliste kam nicht an. Um neu zu fragen, schlie\xDFe den Dialog und \xF6ffne ihn noch einmal.",filament_mid_print:"{printer} druckt gerade aus diesem Fach. \xDCbernehmen stellt es mitten im Druck um.",filament_set:"\xDCbernehmen",filament_rfid_linked:"Eine Bambu-Lab-Spule mit Chip: Das AMS liest Material und Farbe vom Chip, und BamBuddy hat sie dar\xFCber der Spule oben zugewiesen.",filament_rfid:"Eine Bambu-Lab-Spule mit Chip: Material und Farbe liest das AMS vom Chip.",k_profile:"K-Profil (Flussdynamik)",k_keep:"{profile} behalten",k_about:"Der Standard des Druckers und die K-Profile, die auf dem Drucker gespeichert sind, passend zum Filament.",k_default:"Standard des Druckers (K {k})",k_matching:"Passend zu {material}",k_loading:"Der Drucker wird nach seinen K-Profilen gefragt \u2026",k_slow:"Der Drucker antwortet nicht sofort. BamBuddy fragt bis zu dreimal nach, das dauert h\xF6chstens etwa 16 Sekunden.",k_none_saved:"Auf dem Drucker sind f\xFCr den D\xFCsendurchmesser {diameter} keine eigenen K-Profile gespeichert. Eigene Profile, etwa aus der Flussdynamik-Kalibrierung in Bambu Studio oder aus BamBuddy, erscheinen hier. Bis dahin nimmt der Drucker seinen Standard.",k_no_answer:"Der Drucker hat nicht rechtzeitig geantwortet. Um neu zu fragen, schlie\xDFe den Dialog und \xF6ffne ihn noch einmal.",reset_in_use:"Der pausierte Druck nimmt sein Filament aus diesem Fach.",reset_in_use_spool:"Der pausierte Druck nimmt sein Filament von dieser Spule.",hms_next_answers:"Pr\xFCfe den Druck und antworte dann hier \u2013 wie am Display des Druckers.",k_keep_number:"K-Profil Nr. {index} behalten",k_keep_plain:"Das bisherige behalten",k_failed:"Der Drucker hat seine K-Profile nicht genannt: Das Fach beh\xE4lt sein eigenes.",k_unsure:"Im Zweifel so lassen, wie es ist.",rfid_read:"Chip neu lesen",rfid_unload_hint:"Chip neu lesen geht nur, solange kein Filament geladen ist. Gerade ist Filament aus {slots} geladen: entlade es zuerst.",plug_turn_off:"Ausschalten",plug_turn_on:"Einschalten",plug_turn_off_named:"Ausschalten: \u201E{plug}\u201C",plug_turn_on_named:"Einschalten: \u201E{plug}\u201C",load_from:"Laden aus {place}",load_from_external:"Laden von der externen Spule",load_from_left:"Laden von der linken externen Spule",load_from_right:"Laden von der rechten externen Spule",dry_named:"Trocknen: {unit}",dry_stop_named:"Trocknen stoppen: {unit}",rfid_unload_hint_external:"Chip neu lesen geht nur, solange kein Filament geladen ist. Gerade ist Filament von der externen Spule geladen: entlade es zuerst.",rfid_unload_hint_left:"Chip neu lesen geht nur, solange kein Filament geladen ist. Gerade ist Filament von der linken externen Spule geladen: entlade es zuerst.",rfid_unload_hint_right:"Chip neu lesen geht nur, solange kein Filament geladen ist. Gerade ist Filament von der rechten externen Spule geladen: entlade es zuerst.",k_keep_plain_spool:"Das bisherige behalten",k_failed_spool:"Der Drucker hat seine K-Profile nicht genannt: Die Spule beh\xE4lt ihr eigenes.",slot_reset:"Fach zur\xFCcksetzen",spool_reset:"Spule zur\xFCcksetzen",slot_tools_running:"Pausiere erst den Druck: Dann l\xE4sst sich das Fach zur\xFCcksetzen oder der Chip neu lesen.",spool_tools_running:"Pausiere erst den Druck: Dann l\xE4sst sich die Spule zur\xFCcksetzen.",reset_title:"Fach zur\xFCcksetzen?",reset_text:"Material und Farbe des Fachs werden gel\xF6scht. Eine Spule mit Chip erscheint wieder, sobald das AMS den Chip liest.",reset_title_spool:"Spule zur\xFCcksetzen?",reset_text_spool:"Material und Farbe der Spule werden gel\xF6scht.",reset_confirm:"Zur\xFCcksetzen",filament_need_filament:"W\xE4hle noch ein Filament.",dur_min:"{m} Min.",dur_h:"{h} Std.",dur_hm:"{h} Std. {m} Min.",dur_dh:"{d} T. {h} Std.",dur_d:"{d} T.",hours:"Std.",maint_ok:"Wartung OK",maint_due:"Wartung: {n} f\xE4llig",maint_due_soon:"Wartung: {n} bald f\xE4llig",maint_ok_aria:"Wartung OK \u2013 nichts f\xE4llig",maint_due_aria:"{shown} \u2013 {parts}",maint_part_overdue:"{n} \xFCberf\xE4llig",maint_part_soon:"{n} bald f\xE4llig",door_open:"T\xFCr offen",storage_sd:"Keine SD-Karte",storage_usb:"Kein USB-Stick",storage_sd_chip_title:"Keine SD-Karte \u2013 BamBuddy kann keine Drucke an den Drucker senden",storage_usb_chip_title:"Kein USB-Stick \u2013 BamBuddy kann keine Drucke an den Drucker senden",storage_sd_title_in:"SD-Karte",storage_usb_title_in:"USB-Stick",storage_sd_text:"Ohne SD-Karte kann BamBuddy keine Drucke an den Drucker senden, und Drucke kommen ohne Vorschaubild ins Archiv. Stecke eine microSD-Karte ein.",storage_usb_text:"Ohne USB-Stick kann BamBuddy keine Drucke an den Drucker senden, und Drucke kommen ohne Vorschaubild ins Archiv. Stecke einen USB-Stick ein.",storage_sd_in:"Die SD-Karte steckt: BamBuddy kann wieder Drucke senden.",storage_usb_in:"Der USB-Stick steckt: BamBuddy kann wieder Drucke senden.",dry_chip_one_bare:"Trocknet",dry_chip_many_bare:"{n} AMS trocknen",dry_chip_aria:"{n} AMS-Einheiten trocknen, alle fertig in {time}",dry_chip_unit:"{unit} trocknet",dry_chip_unit_aria:"{unit} trocknet, fertig in {time}",dry_chip_many_short:"{n}\xD7",maint_title:"Wartung",maint_never:"Noch nie als erledigt markiert",maint_overdue:"{time} \xFCberf\xE4llig",maint_soon:"Bald f\xE4llig: in {time}",maint_in:"F\xE4llig in {time}",maint_done:"Erledigt",maint_done_aria:"\u201E{task}\u201C als erledigt markieren",maint_confirm:"Als erledigt markieren? Die Z\xE4hlung beginnt neu.",maint_hours:"Druckstunden: {hours}",maint_note:"Aufgaben und Intervalle stellst du in BamBuddy ein.",maint_all_never:"BamBuddy z\xE4hlt ab 0 Std., bis eine Aufgabe einmal als erledigt markiert ist. Markiere, was du schon gemacht hast.",maint_all_never_hidden:"BamBuddy z\xE4hlt ab 0 Std., bis eine Aufgabe einmal als erledigt markiert ist. Als erledigt markieren kannst du sie in BamBuddy \u2013 diese Karte blendet ihre Steuerelemente aus.",maint_none:"Keine Wartungsaufgaben.",maint_task_clean_build_plate:"Druckplatte reinigen",maint_task_clean_nozzle:"D\xFCse und Hotend reinigen",maint_task_belt_tension:"Riemenspannung pr\xFCfen",maint_task_ptfe_tube:"PTFE-Schlauch pr\xFCfen",maint_task_clean_carbon_rods:"Carbonstangen reinigen",maint_task_lubricate_steel_rods:"Stahlstangen schmieren",maint_task_clean_steel_rods:"Stahlstangen reinigen",maint_task_lubricate_rails:"Linearschienen schmieren",maint_task_clean_rails:"Linearschienen reinigen",check_again:"Erneut pr\xFCfen",check_running:"Die Verbindung wird gepr\xFCft \u2026 {s} s",check_running_sr:"Die Verbindung wird gepr\xFCft \u2026",check_running_hint:"Das dauert meist ein paar Sekunden, h\xF6chstens eine halbe Minute.",check_error:"Die Pr\xFCfung konnte nicht laufen: {error}",check_ok:"Keine Probleme gefunden.",check_warnings_one:"Der Drucker sollte funktionieren, aber 1 Punkt braucht Aufmerksamkeit.",check_warnings:"Der Drucker sollte funktionieren, aber {n} Punkte brauchen Aufmerksamkeit.",check_problems_one:"1 Problem gefunden.",check_problems:"{n} Probleme gefunden.",check_passed_one:"1 Pr\xFCfung bestanden",check_passed:"{n} Pr\xFCfungen bestanden",check_skipped:"{n} nicht gepr\xFCft",check_follows:"Folgt meist aus dem Problem oben.",check_skip:"Nicht gepr\xFCft.",check_port_mqtt:"Steuerung (Port 8883)",check_port_mqtt_fail:"Nicht erreichbar. Ist der Drucker an und hat er noch dieselbe IP-Adresse? Blockiert eine Firewall den Port?",check_port_ftps:"Datei\xFCbertragung (Port 990)",check_port_ftps_warn:"Nicht erreichbar: BamBuddy kann keine Drucke senden.",check_port_ftps_warn_fix:"Gib Port 990 frei.",check_port_ftps_warn_no_tls:"Port offen, aber der Dateidienst des Druckers h\xE4ngt. Starte den Drucker neu.",check_port_rtsps:"Kamera (Port {port})",check_port_rtsps_warn:"Nicht erreichbar: kein Livebild. Drucken geht trotzdem.",check_macos_local_network:"macOS: lokales Netzwerk",check_macos_local_network_warn_unsigned:"macOS blockiert die Verbindung ohne Meldung. F\xFChre das Update-Skript von BamBuddy aus (install/update_macos.sh) und starte BamBuddy neu.",check_macos_local_network_warn_permission:"Erlaube das Python von BamBuddy unter Systemeinstellungen \u2192 Datenschutz & Sicherheit \u2192 Lokales Netzwerk.",check_network_mode:"Netzwerk des Containers",check_network_mode_warn:"BamBuddy l\xE4uft im Bridge-Netz. F\xFCr die Druckersuche braucht es das Host-Netz (\u201Enetwork_mode: host\u201C).",check_network_mode_skip:"L\xE4uft nicht in einem Container.",check_network_mode_skip_unknown:"In einem Container ({runtime}); sein Netzwerkmodus ist nicht ermittelbar.",check_network_mode_skip_system_container:"In einem Systemcontainer ({runtime}): nicht anwendbar.",check_subnet:"Subnetz",check_subnet_warn:"Drucker ({printer_ip}) und BamBuddy ({host_ip}) sind in verschiedenen Netzen. Das geht nur mit Routing dazwischen.",check_subnet_skip:"Nicht ermittelbar.",check_external_storage:"Dateien auf externem Speicher",check_external_storage_fail:"Am Drucker aus: Archive bekommen kein Vorschaubild. Schalte \u201EGesendete Dateien auf externem Speicher speichern\u201C ein \u2013 am Drucker unter Druckeinstellungen oder im Slicer im Ger\xE4te-Tab.",check_external_storage_fail_no_media:"Keine SD-Karte und kein USB-Stick im Drucker: Drucke lassen sich nicht senden. Stecke eine SD-Karte oder einen USB-Stick ein.",check_external_storage_warn_internal_storage:"Der letzte Druck lag im internen Speicher, den BamBuddy nicht lesen kann: Er ist ohne Vorschaubild archiviert. Starte Drucke aus BamBuddy, oder sende sie im Slicer mit \u201ESenden\u201C und \u201EExtern\u201C.",check_external_storage_warn_internal_history:"Der letzte Druck kam aus dem Speicher des Druckers: ohne Vorschaubild archiviert. Starte Drucke aus BamBuddy oder dem Slicer.",check_external_storage_skip_unsupported_model:"Beim P1 nicht einstellbar. Nichts zu tun.",check_mqtt_auth:"Zugangsdaten",check_mqtt_auth_fail:"Erreichbar, aber nicht verbunden. Meist stimmt der Zugangscode nicht mehr: Er \xE4ndert sich, wenn du \u201ELAN Only\u201C oder den Entwicklermodus umschaltest. Trage ihn in BamBuddy neu ein.",check_mqtt_auth_fail_auth_rejected:"Der Drucker lehnt Zugangscode oder Seriennummer ab. Lies den Zugangscode am Display ab und trage ihn in BamBuddy neu ein.",check_mqtt_auth_skip:"Nicht gepr\xFCft: Port 8883 ist nicht erreichbar.",check_developer_mode:"Entwicklermodus (LAN)",check_developer_mode_skip:"Nicht gepr\xFCft: Daf\xFCr braucht es eine Verbindung zum Drucker.",check_printer_publishing:"Statusmeldungen",check_printer_publishing_fail:"Verbunden, aber der Drucker meldet nichts. Meist ist die Seriennummer in BamBuddy falsch geschrieben (Gro\xDF- und Kleinschreibung z\xE4hlt).",check_printer_publishing_skip:"Nicht gepr\xFCft: Daf\xFCr braucht es eine Verbindung zum Drucker.",ventilation:"L\xFCften",vent_fans_exhaust:"Abluftl\xFCfter",vent_fans_right_aux_exhaust:"Rechter Zusatzl\xFCfter und Abluftl\xFCfter",vent_fans_aux:"Zusatzl\xFCfter",vent_fans_aux_exhaust:"Zusatzl\xFCfter und Abluftl\xFCfter",vent_chamber_heats:"Solange die Kammer heizt, l\xE4sst sie sich nicht l\xFCften. Schalte zuerst oben unter \u201EHeizen\u201C die Kammer aus.",chamber_vent_on:"Solange die Kammer gel\xFCftet wird, l\xE4sst sie sich nicht heizen. Schalte zuerst unten unter \u201EL\xFCften\u201C die Kammer aus.",keep_warm_vent_on:"Solange die Kammer gel\xFCftet wird, l\xE4sst sie sich nicht warm halten. Schalte zuerst unten unter \u201EL\xFCften\u201C die Kammer aus.",chamber_cooling_print:"Der Drucker druckt im K\xFChlmodus: Die Kammer l\xE4sst sich erst nach dem Druck heizen.",vent_print_cooling:"W\xE4hrend des Drucks regelt der Drucker diesen L\xFCfter auch selbst und kann die Stufe wieder \xE4ndern.",vent_print_cooling_two:"W\xE4hrend des Drucks regelt der Drucker diese L\xFCfter auch selbst und kann die Stufe wieder \xE4ndern.",vent_heating_print:"Der Drucker druckt im Heizmodus: L\xFCften geht erst nach dem Druck.",vent_keep_warm:"Solange die Kammer warm gehalten wird, l\xE4sst sie sich nicht l\xFCften. Schalte zuerst oben unter \u201EHeizen\u201C die Kammer aus.",heat_vent_hint:"Heizen h\xE4lt die W\xE4rme in der Kammer (ABS, ASA, PC, PA), L\xFCften holt Frischluft hinein (PLA, TPU). Bei jedem Druckstart stellt der Drucker das selbst ein.",tile_vent:"L\xFCften {value}",keep_warm:"W\xE4rme halten",vent_lower:"L\xFCften {step}\xA0% weniger",vent_raise:"L\xFCften {step}\xA0% mehr",vent_start:"Mit {value} l\xFCften",vent_off:"L\xFCften ausschalten",vent_said:"L\xFCften, Stufe:",airduct_laser_idle:"Der Drucker steht noch im Lasermodus (f\xFCr sein Lasermodul). L\xFCften stellt auf K\xFChlen um.",airduct_laser_now:"Gerade im Lasermodus: Den stellt der Drucker f\xFCr sein Lasermodul ein.",airduct_busy:"\xC4nderbar, sobald der Druck fertig ist.",backup:"AMS-Filament-Backup",backup_sub:"Ist eine Spule leer, druckt der Drucker mit einer gleichen Spule aus dem AMS weiter: gleiche Marke, gleiches Material, gleiche Farbe.",backup_dual:"Bei zwei D\xFCsen nur Spulen derselben Seite.",backup_unknown:"Zustand unbekannt: BamBuddy meldet ihn f\xFCr diesen Drucker nicht. Ein- und Ausschalten geht trotzdem.",backup_turn_off:"Ausschalten",backup_turn_on:"Einschalten",on:"An",off:"Aus",block_power:"Strom",chip_power:"Strom",power_title:"Strom",plug_printer_tag:"Drucker",plug_today:"heute {energy}",plug_unreachable:"Nicht erreichbar: BamBuddy bekommt keine Antwort von der Steckdose.",plug_unknown:"Zustand unbekannt: Die Steckdose meldet ihn nicht.",plug_run:"Ausf\xFChren",plug_script:"Skript in Home Assistant",plug_monitor:"Nur Anzeige: BamBuddy kann diese Steckdose nicht schalten.",plug_off_title_printer:"Drucker ausschalten?",plug_off_text_printer:"Die Steckdose \u201E{plug}\u201C schaltet den Strom ab. BamBuddy zeigt den Drucker dann als offline; nach dem Einschalten ist er nach etwa einer Minute wieder da.",plug_off_hot:"Die D\xFCse ist noch {temperature} hei\xDF: Ohne Strom steht auch ihr L\xFCfter.",plug_off_hot_left:"Die linke D\xFCse ist noch {temperature} hei\xDF: Ohne Strom steht auch ihr L\xFCfter.",plug_off_hot_right:"Die rechte D\xFCse ist noch {temperature} hei\xDF: Ohne Strom steht auch ihr L\xFCfter.",plug_off_title_print:"Druck abbrechen und ausschalten?",plug_off_text_print:"\u201E{job}\u201C ist bei {progress}. Ohne Strom bricht der Druck ab und l\xE4sst sich nicht fortsetzen.",plug_off_text_print_plain:"Ohne Strom bricht der Druck ab und l\xE4sst sich nicht fortsetzen.",plug_off_print_note:"Nur f\xFCr den Notfall. Stoppe sonst erst den Druck und lass die D\xFCse abk\xFChlen.",plug_off_keep:"Nicht ausschalten",plug_off_text_offline:"BamBuddy erreicht den Drucker nicht und wei\xDF nicht, ob er gerade druckt. Die Steckdose liefert {power} \u2013 l\xE4uft noch ein Druck, bricht er ohne Strom ab.",plug_off_text_offline_plain:"BamBuddy erreicht den Drucker nicht und wei\xDF nicht, ob er gerade druckt. L\xE4uft noch ein Druck, bricht er ohne Strom ab.",plug_off_text_offline_idle:"BamBuddy erreicht den Drucker nicht. Die Steckdose liefert {power} \u2013 so viel wie ein Drucker im Leerlauf; er druckt also wohl nicht.",plug_off_confirm:"Ausschalten",plug_off_title:"\u201E{plug}\u201C ausschalten?",plug_off_text:"Alles, was an dieser Steckdose h\xE4ngt, ist dann ohne Strom.",auto_off_title:"Nach dem Druck ausschalten",auto_off_every:"Nach jedem Druck, sobald die D\xFCse unter {temperature} ist.",auto_off_next:"Nach dem n\xE4chsten Druck, sobald die D\xFCse unter {temperature} ist.",auto_off_disarmed:"Der Drucker bleibt nach dem Druck an.",auto_off_waiting_title:"Wartet aufs Ausschalten",auto_off_waiting_short:"Wartet",auto_off_waiting:"Sobald die D\xFCse unter {temperature} ist \xB7 jetzt {now}",auto_off_waiting_drying:"Wartet, bis das AMS fertig getrocknet hat.",auto_off_skip:"Diesmal nicht ausschalten",auto_off_skipped:"Diesmal bleibt der Drucker an; nach dem n\xE4chsten Druck schaltet er wieder aus.",auto_off_failed:"Druck abgebrochen oder fehlgeschlagen \u2013 der Drucker bleibt diesmal an.",auto_off_failed_next:"Druck abgebrochen oder fehlgeschlagen \u2013 der Drucker bleibt an.",auto_off_gave_up:"Nicht ausgeschaltet: Der Drucker war in zwei Stunden nicht bereit (die D\xFCse blieb hei\xDF, das AMS trocknete, eine Zieltemperatur war gesetzt oder BamBuddy hat den Drucker verloren), oder die Steckdose hat nicht geantwortet.",auto_off_bambuddy:"BamBuddy schaltet diese Steckdose nach dem Druck schon selbst aus (Auto Aus). Um das hier einzustellen, schalte Auto Aus in BamBuddy ab.",auto_off_bambuddy_view:"BamBuddy schaltet diese Steckdose nach dem Druck schon selbst aus (Auto Aus).",auto_off_done_at:"Nach dem Druck um {time} ausgeschaltet.",auto_off_temperature:"Ausschalten, sobald die D\xFCse k\xFChler ist als",auto_off_when:"Wann",auto_off_every_choice:"Nach jedem Druck",auto_off_next_choice:"Nur nach dem n\xE4chsten Druck",auto_off_dialog_note:"Nur nach einem fertigen Druck \u2013 nie w\xE4hrend eines Drucks oder einer Pause, nie w\xE4hrend das AMS Filament wechselt oder trocknet.",offline_plug_off:"Der Drucker ist aus: Seine Steckdose \u201E{plug}\u201C ist ausgeschaltet.",power_on:"Drucker einschalten",power_starting:"Drucker startet \u2026 {time}",power_starting_text:"BamBuddy verbindet sich meist nach etwa einer Minute.",power_plug_on:"Steckdose an \xB7 {power}",offline_plug_on_power:"Die Steckdose liefert Strom ({power}), aber BamBuddy erreicht den Drucker nicht.",offline_plug_on_zero:"Die Steckdose zeigt 0 W: Ist der Netzschalter am Drucker aus?",chip_power_off:"Strom aus",chip_power_unreachable:"Steckdose nicht erreichbar",chip_power_on:"Strom an",chip_power_plug:"{plug} \xB7 {power}",chip_power_plug_state:"{plug}: {state}",chip_power_unknown:"Strom unbekannt",chip_power_unreachable_short:"Nicht erreichbar",chip_power_unknown_short:"Unbekannt",chip_power_aria:"{shown} \u2013 Steckdose \u201E{plug}\u201C",editor_show_auto_off:"Zeile \u201ENach dem Druck ausschalten\u201C",editor_show_auto_off_help:"Blendet im Bereich \u201EStrom\u201C und im Dialog des Strom-Chips die Zeile unter der Steckdose des Druckers ein oder aus. Mit ihr l\xE4sst sich w\xE4hlen, ob sich der Drucker nach dem Druck von selbst ausschaltet. Ist die Zeile ausgeblendet, schaltet er trotzdem aus, wenn es so eingestellt ist.",auto_off_lower:"Ausschalttemperatur um {step}\xA0{unit} senken",auto_off_raise:"Ausschalttemperatur um {step}\xA0{unit} erh\xF6hen",auto_off_waiting_filament:"Wartet, bis das AMS das Filament gewechselt hat.",auto_off_waiting_heating:"Wartet: Am Drucker ist eine Zieltemperatur eingestellt.",auto_off_waiting_printer:"Wartet, bis BamBuddy den Drucker wieder erreicht.",auto_off_waiting_plug:"Wartet, bis die Steckdose antwortet.",auto_off_switching:"Schaltet aus \u2026",power_off_plug:"Steckdose ausschalten",plug_run_named:"\u201E{plug}\u201C ausf\xFChren"};var Li={picker_name:"BamBuddy printer",picker_description:"Shows and controls a printer from BamBuddy: progress, camera, temperatures, filament and moving the axes.",no_printer:"Choose a printer in the card's settings.",not_found:"This printer is no longer available. In the card's settings, choose it again \u2013 or another one.",not_a_printer:"This device is not a BamBuddy printer. Choose a printer, not an AMS unit, a smart plug or the BamBuddy server.",waiting_for_printer:"Waiting for the printer's data \u2026",invalid_option:"Invalid value for \u201C{option}\u201D: {value}. Allowed: {allowed}.",allowed_device:"the ID of a printer device",editor_unavailable:"The visual editor did not load. Edit the card in the code editor (\u201CShow code editor\u201D).",editor_printer:"Printer",editor_printer_help:"A printer of the BamBuddy integration, not an AMS unit.",editor_camera:"Live view",editor_camera_help:"On tap: a tap on the camera symbol on the picture starts it. Always: it runs while the dashboard is open, using bandwidth all the time. Never: only the job's picture.",camera_tap:"On tap",camera_always:"Always",cover_open:"Show the job's picture large",cover_close:"Close the job's picture",camera_off:"Never",allowed_list:"a list of {values}",editor_group_general:"General",editor_start_hidden:"Warning: the \u201C{tab}\u201D tab is hidden. The card opens on \u201CStatus\u201D.",editor_group_status:"Status",editor_group_control:"Control",editor_group_filament:"Filament",editor_blocks:"Add section",editor_blocks_help:"The sections of the \u201CStatus\u201D tab below the print job. Drag a section where you want it; \xD7 hides it. Print controls and print speed show only during a print, Power only when BamBuddy links a plug to the printer.",sample_job:"Example \u2013 shown during a print",sample_offline:"Example \u2013 shown once the printer is online",sample_unreachable:"Example \u2013 shown once BamBuddy answers",block_controls:"Print controls",block_temperatures:"Temperatures",block_ams:"AMS and filament",block_fans:"Fans",block_speed:"Print speed",editor_chips:"Add chip",editor_chips_help:"The chips below the name. Drag a chip where you want it; \xD7 hides it. Door, SD card / USB drive and drying appear only while the door is open, the storage is missing or an AMS dries; Power only with a smart plug. An HMS error always shows.",chip_network:"Network",chip_hms:"HMS",chip_firmware:"Firmware",chip_maintenance:"Maintenance",chip_door:"Door",chip_storage:"SD card / USB drive",chip_drying:"Drying",editor_start_view:"Tab on opening",editor_control_tab:"\u201CControl\u201D tab",editor_control_tab_help:"Shows or hides the tab with heating and ventilation, print options, axes and extruder.",editor_sections:"Add section",editor_sections_help:"The sections of the \u201CControl\u201D tab. Drag a section where you want it; \xD7 hides it.",section_heating:"Heating and ventilation",section_options:"Print options",section_motion:"Axes and extruder",editor_read_only:"Hide controls",editor_read_only_help:"Shows the printer only: the light, heating, ventilation and the print options as states, without buttons; the print and filament buttons, drying, the plugs' switches, and the axes and extruder go. No lock: actions, automations and the device page still control it.",editor_filament_tab:"\u201CFilament\u201D tab",editor_filament_tab_help:"Shows or hides the tab with the AMS units and the external spool \u2013 for loading, unloading, setting and drying filament.",editor_ams_folding:"AMS units",editor_ams_folding_help:"Folded shows each unit without its slots; a tap unfolds it.",editor_external_spool:"Show external spool",editor_external_spool_help:"Shows or hides the external spool in the Status and Filament tabs. Hiding it takes effect only on a printer with an AMS; while the printer feeds from the external spool, the card shows it all the same.",editor_compact_chips:"Compact chips",editor_compact_chips_help:"Short chip texts: icon and value, e.g. \u201COK\u201D instead of \u201CHMS OK\u201D. The full text shows as a tooltip and is read out by screen readers.",folding_auto:"Automatic (folded from 3)",folding_folded:"Folded",folding_open:"Unfolded",tab_status:"Status",tab_control:"Control",tab_filament:"Filament",aria_views:"Views",online:"Online",offline:"Offline",light:"Chamber light",light_plain:"Light",dismiss:"Close",error_dismiss:"Dismiss the error",cancel:"Cancel",error_generic:"That did not work. Try again in a moment.",sent:"Sent",ams_activity:"AMS: {state}",more:"More options",menu_device_page:"Open device page",menu_info:"Printer information",menu_refresh:"Refresh status",menu_maintenance:"Maintenance",check_connection:"Check connection",wifi:"Wi-Fi",wifi_signal:"Network: Wi-Fi, {value}, {quality}",wifi_good:"good",wifi_fair:"fair",wifi_weak:"weak",lan:"LAN",lan_aria:"Network: LAN (wired)",lan_wired:"LAN (wired)",hms_ok:"HMS OK",chip_ok:"OK",hms_pill_aria:"{count} HMS messages",hms_pill_aria_one:"1 HMS message",hms_pill_none:"HMS OK \u2013 no messages",hms_title:"Printer messages (HMS)",hms_none_dialog:"No messages. HMS is the printer's own warning system.",hms_next:"Check the print, then resume or stop it.",hms_next_elsewhere:"Check the print, then resume or stop it at the printer or in BamBuddy.",hms_next_read:"Check the print, then resume or stop it at the printer, in BamBuddy or in Home Assistant.",hms_more:"+{n} more",hms_clear_note:"Clearing only removes the message: errors the printer still sees come back.",firmware:"Firmware",firmware_update:"Firmware {version}: update available",firmware_update_label:"Update {latest} available, firmware {version} installed",firmware_update_chip:"Update {version}",firmware_offline:"Firmware {version} (printer offline)",firmware_unreachable:"Firmware {version} (no data from BamBuddy)",firmware_current:"Firmware {version}: up to date",firmware_version:"Firmware {version}",firmware_installed:"Installed",firmware_latest:"Latest",firmware_available:"Available",firmware_notes:"Release notes",firmware_note:"Install updates on the printer, in Bambu Handy or in BamBuddy.",info_model:"Model",info_name:"Name in BamBuddy",info_server:"BamBuddy server",info_status:"Status",info_print_status:"Print status",info_ip:"IP address",info_serial:"Serial number",info_network:"Network",info_developer:"Developer mode",info_nozzle:"Nozzle",info_nozzles:"Nozzles",info_hours:"Print hours",info_on:"On",info_off:"Off",info_developer_note:"The printer takes no commands.",nozzle_side:"{side}: {nozzle}",copy_ip:"Copy IP address",copy_serial:"Copy serial number",copied:"Copied",no_job:"No print running",offline_text:"The printer is offline. Check that it is switched on and connected to BamBuddy.",unreachable_text:"No data from BamBuddy. Check that BamBuddy is running, and under Settings \u2192 Devices & services whether it asks for a new API key.",unreachable_text_user:"No data from BamBuddy. Check that BamBuddy is running; an administrator may need to enter a new API key.",unreachable_short:"No data from BamBuddy",missing_text:"BamBuddy no longer lists this printer. You can remove it under Settings \u2192 Repairs; once BamBuddy lists it again, it comes back here by itself.",missing_text_user:"BamBuddy no longer lists this printer. Once BamBuddy lists it again, it comes back here by itself.",missing_short:"No longer in BamBuddy",layer:"Layer {current} / {total}",remaining:"{time} left",ends:"Ends {time}",progress:"Progress",live:"Live view",live_badge:"Live",live_stop:"Close the live view",fullscreen_open:"Full screen",fullscreen_close:"Exit full screen",camera_failed:"The camera is not available.",fps_value:"{fps} fps",fps_aria:"{fps} frames a second",fps_measuring:"Measuring the frame rate",fps_open:"Set the frame rate",fps_title:"Camera frame rate",fps_lower:"{step} fewer frames a second",fps_raise:"{step} more frames a second",fps_note:"This camera gives up to {max} frames a second; you can set {min} to {max} in steps of {step}. It applies to this printer throughout Home Assistant \u2013 on every dashboard, phone and computer. While someone else watches \u2013 on BamBuddy's own page, say \u2013 BamBuddy may stay at their rate: yours applies from the next time the live view opens while nobody else watches. The chip in the live view shows what arrives.",retry:"Try again",nozzle:"Nozzle",nozzle_left:"Left nozzle",nozzle_right:"Right nozzle",bed:"Bed",chamber:"Chamber",heater_off:"Off",target:"Target {value}",fan_part:"Part cooling",fan_aux:"Auxiliary",fan_chamber:"Chamber",fan_exhaust:"Exhaust",fan_left_aux:"Left auxiliary",fan_right_aux:"Right auxiliary",fan_hotend:"Hotend",fan_part_name:"Part cooling fan",fan_aux_name:"Auxiliary fan",fan_chamber_name:"Chamber fan",fan_exhaust_name:"Exhaust fan",fan_left_aux_name:"Left auxiliary fan",fan_right_aux_name:"Right auxiliary fan",fan_hotend_name:"Hotend fan",fan_off:"Off",fans:"Fans",open_filament:"Open the filament view",strip_unit:"{name}: {slots}",strip_humidity:"humidity {humidity}",strip_temperature:"temperature {temperature}",side_left_short:"L",side_right_short:"R",external_short:"Ext",hms_error:"Error",hms_warning:"Warning",hms_notice:"Notice",hms_no_text:"{severity}: BamBuddy has no text for this code.",hms_answer_resume_printing:"Resume printing",hms_answer_resume_printing_defects:"Resume (defects acceptable)",hms_answer_resume_printing_probelm_solved:"Resume (problem solved)",hms_answer_problem_solved_resume:"Problem solved, resume",hms_answer_filament_load_resume:"Filament loaded, resume",hms_answer_proceed:"Proceed",hms_answer_dbl_check_resume:"Resume",hms_answer_stop_printing:"Stop printing",hms_answer_ignore_resume:"Ignore and resume",hms_answer_ignore_no_reminder_next_time:"Ignore, don't remind me again",hms_answer_dont_remind_next_time:"Don't remind me again",hms_answer_no_reminder_next_time:"Don't remind me again",hms_answer_filament_extruded:"Filament extruded, continue",hms_answer_dbl_check_done:"Done",hms_answer_retry_filament_extruded:"Not extruded yet, retry",hms_answer_continue:"Finished, continue",hms_answer_retry_problem_solved:"Retry (problem solved)",hms_answer_dbl_check_retry:"Retry",hms_answer_abort:"Abort",hms_answer_ok_button:"OK",hms_answer_dbl_check_ok:"Confirm",hms_answer_refresh_nozzle:"Check again",hms_answer_turn_off_fire_alarm:"Turn off the fire alarm",hms_answer_stop_drying:"Stop drying",hms_answer_disable_purification:"No air purification for this print",hms_wiki:"HMS codes in the Bambu Lab wiki",hms_unknown:"HMS message",hms_count:"HMS errors: {count}",hms_clear:"Clear HMS errors",plate_text:"Take the print off the plate, then tap \u201CPlate cleared\u201D. BamBuddy starts the next queued print only after that.",plate_text_read:"Take the print off the plate. BamBuddy starts the next queued print only once that is confirmed: in BamBuddy, or with \u201CPlate cleared\u201D in Home Assistant.",plate_text_bambuddy:"Take the print off the plate. BamBuddy starts the next queued print only once that is confirmed in BamBuddy.",plate_cleared:"Plate cleared",pause:"Pause print",resume:"Resume print",paused_empty:"No filament loaded. Load one in the Filament tab before resuming.",paused_empty_no_tab:"No filament loaded. Load one before resuming.",stop:"Stop print",speed:"Print speed",developer_off:"The printer takes no commands: its developer LAN mode is off. Turn it on at the printer's screen under Settings \u2192 Network (or WLAN): first \u201CLAN Only Mode\u201D, then \u201CDeveloper Mode\u201D. Then enter the new access code in BamBuddy.",stop_title:"Stop the print?",stop_text:"The print cannot be resumed.",stop_keep:"Keep printing",stop_confirm:"Stop print",skip:"Skip objects",skip_one:"Skip 1 object",skip_many:"Skip {count} objects",skip_text:"Skipped objects cannot be printed again in this job.",skip_loading:"Loading the objects \u2026",skip_none_listed:"BamBuddy lists no objects for this print.",skip_object:"Object {id}",skip_skipped:"Skipped",skip_all:"To skip every object, stop the print instead.",skip_single:"This print has only one object. To leave it out, stop the print.",heating:"Heating",heat_now:"Now {value}",heat_lower:"{what} {step}\xA0{unit} cooler",heat_raise:"{what} {step}\xA0{unit} hotter",heat_start:"{what}: heat to {value}",heat_off:"{what}: turn off",active_nozzle:"Active nozzle",nozzle_active:"active",step:"Step",move:"Move {axis} by {distance} mm",home:"Home",slot_named:"{shown} \u2013 {place}",external_left_place:"Left external spool",external_right_place:"Right external spool",heat_target_said:"{what} target:",hours_long:"hours",home_aria:"Home all axes",maint_marked:"\u201C{task}\u201D marked as done.",home_title:"Home all axes?",home_text:"The toolhead moves to its home position; remove anything from the plate first.",bed_axis:"Bed",bed_closer:"Closer",bed_away:"Away",bed_closer_aria:"Move the bed {step} mm closer to the nozzle",bed_away_aria:"Move the bed {step} mm away from the nozzle",nozzle_height:"Nozzle height",nozzle_closer_aria:"Move the nozzle {step} mm closer to the bed",nozzle_away_aria:"Move the nozzle {step} mm away from the bed",extruder:"Extruder",extrude:"Extrude",retract:"Retract",extrude_aria:"Extrude {length} mm of filament",retract_aria:"Retract {length} mm of filament",cold_nozzle:"To extrude, heat the nozzle to at least {temperature} under Heating.",cold_nozzle_left:"To extrude, heat the left nozzle (active) to at least {temperature} under Heating.",cold_nozzle_right:"To extrude, heat the right nozzle (active) to at least {temperature} under Heating.",cold_nozzle_plain:"To extrude, the nozzle must be at least {temperature}.",cold_nozzle_left_plain:"To extrude, the left nozzle (active) must be at least {temperature}.",cold_nozzle_right_plain:"To extrude, the right nozzle (active) must be at least {temperature}.",jog_note:"Tap the house first so the printer knows where it is. When you move it with the arrows, it does not stop at the edges of its build space: a large step can hit the end. Near an edge, choose a small step.",busy_reason:"Moving and extruding are possible once the print is done.",changing_reason:"Wait until the filament change is done.",changing_paused:"Wait until the filament change is done, then resume.",detection:"Print options",detection_all_on:"All on",detection_off:"{off} off",detection_all_off:"All off",detection_hint:"On: the printer pauses the print when the detection triggers. Sensitivity as set on the printer. A detection switched off stays off for later prints too.",detection_hint_plain:"On: the printer pauses the print when the detection triggers. A detection switched off stays off for later prints too.",detection_ai_monitoring:"AI print monitoring",detection_ai_monitoring_x1:"Spaghetti and purge chute pile-ups",detection_first_layer_inspection:"First layer inspection",detection_build_plate_detection:"Build plate detection",detection_build_plate_position_detection:"Build plate position detection",detection_spaghetti_detection:"Spaghetti detection",detection_pileup_detection:"Purge chute pile-up detection",detection_clumping_detection:"Nozzle clumping detection",detection_air_printing_detection:"Air printing detection",external:"External spool",externals:"External spools",left:"Left",right:"Right",humidity:"Humidity",temperature:"Temperature",empty:"Empty",not_set:"Not set",unknown:"Unknown",in_use:"In use",inv_tabs:"How the slot is set",inv_tab_set:"Set filament",inv_tab_inventory:"From the inventory",inv_from:"Assigned spool from the inventory",inv_no:"No. {id}",inv_warn_change:"Setting this ends the assignment of {name}.",inv_note_change:"Another color or another type (PETG instead of PLA, say) ends the spool's assignment.",inv_loading:"Reading BamBuddy's spools \u2026",inv_failed:"The inventory could not be read. To ask again, close the dialog and open it once more.",inv_vendor:"Vendor",inv_material:"Material",inv_all:"All",inv_search:"Search (name, color, no.)",inv_choose:"Choose a spool",inv_here:"Assigned: this slot",inv_in_slot:"Assigned: {unit}, slot {slot}",inv_in_unit:"Assigned: {unit}",inv_ext:"Assigned: external spool",inv_ext_left:"Assigned: external spool (left)",inv_ext_right:"Assigned: external spool (right)",inv_other:"Assigned: {printer}, {where}",inv_other_slot:"{unit}, slot {slot}",inv_other_ext:"external spool",inv_other_ext_left:"external spool (left)",inv_at_printer:"{printer}, {where}",inv_other_ext_right:"external spool (right)",inv_from_ext:"the external spool",inv_from_ext_left:"the external spool (left)",inv_from_ext_right:"the external spool (right)",inv_from_printer:"printer {printer}, {where}",inv_not_nozzle:"Not for this nozzle",inv_not_ams:"Not for the AMS",inv_printing:"Locked while {printer} is printing.",inv_warn_material:"The spool is {material}, the slot is set to {slot}. Assigning sets the slot to {material}.",inv_warn_material_printing:"{printer} is printing from this slot ({slot}). Assigning switches it to {material} mid-print.",inv_by_chip:"Linked by its chip",inv_not_printer:"Not for this printer",inv_takes_from:"Assigning takes the spool out of {where}.",inv_no_hit:"No spool matches the search.",inv_empty_slot:"The slot is empty. BamBuddy sets it once the spool is in.",inv_unassign:"Remove assignment",inv_assign:"Assign",inv_busy_change:"{printer} is changing filament.",inv_location:"Location",inv_stored:"Storage location: {location}",inv_also:"Also assigned: {where}",inv_waiting:"Waiting for the spool",inv_strip_waiting:"{empty} \xB7 {name} waiting",load:"Load",unload:"Unload",load_title_from:"Load {filament} from {place}?",load_title_external:"Load {filament} from the external spool?",load_title_left:"Load {filament} from the left external spool?",load_title_right:"Load {filament} from the right external spool?",load_text:"The printer heats the nozzle, unloads the current filament and loads this one. This takes a few minutes.",load_text_left:"The printer heats the left nozzle, unloads its filament and loads this one. This takes a few minutes.",load_text_right:"The printer heats the right nozzle, unloads its filament and loads this one. This takes a few minutes.",unload_text_left:"The printer heats the left nozzle and pulls its filament back.",unload_text_right:"The printer heats the right nozzle and pulls its filament back.",strip_nozzle_left:"left nozzle",strip_nozzle_right:"right nozzle",unload_title:"Unload the filament?",unload_text:"The printer heats the nozzle and pulls the filament back.",ht_load:"Load filament from the AMS HT on the printer's screen.",filament_pause:"Pause the print to change the filament.",filament_paused:"Print paused: you can change the filament now.",filament_paused_fault:"The printer paused the print: deal with its message first. You can change the filament here, then resume.",paused_change:"The print stays paused. Resume it once the new filament is in.",drying:"Drying \xB7 {time}\xA0left",dry_at_printer:"Start and stop it on the printer's screen.",drying_now:"Drying",drying_at:"Drying at {temperature} \xB7 {time}\xA0left",drying_now_at:"Drying at {temperature}",not_drying:"Not drying",dry:"Dry",dry_stop:"Stop drying",dry_stop_title:"Stop drying?",dry_stop_text:"{unit} has {time} of drying left.",dry_stop_now:"{unit} will stop drying.",dry_keep:"Keep drying",dry_title:"Dry the filament in {unit}",dry_temperature:"Temperature",dry_duration:"Duration",dry_start:"Start drying",dry_suggested:"Suggested for the loaded filament.",dry_suggested_for:"Suggested for the loaded filament: {filaments}.",dry_mixed:"Set for the most heat-sensitive spool: {spools}",dry_temperature_lower:"Lower the temperature",dry_temperature_raise:"Raise the temperature",dry_duration_lower:"Shorten the drying",dry_duration_raise:"Lengthen the drying",set_filament:"Set filament",edit_slot:"Edit {slot}",edit_external:"Edit the external spool",edit_external_left:"Edit the left external spool",edit_external_right:"Edit the right external spool",slot_label:"Slot {slot} \xB7 {unit}",filament_title:"Filament of {slot}",filament_title_external:"Filament of the external spool",filament_title_left:"Filament of the left external spool",filament_title_right:"Filament of the right external spool",vendor:"Vendor",filament_field:"Filament",profile_title:"Slot profile",profile_help:"The profiles Bambu Studio comes with, for this printer, its nozzle and this slot. Your own profiles are not here; set those on the printer or in BamBuddy.",profile_keep:"Keep the current profile",profile_own:"A profile of your own that Bambu Studio's list does not know ({type}).",profile_none:"No profile set ({type}).",profile_current:"Current profile: {name}.",material_keep:"Keep {name}",material_choose:"Choose \u2026",color:"Color",color_other:"Other color \u2026",color_current:"Current color",color_chosen:"Chosen color",color_white:"White",color_black:"Black",color_gray:"Gray",color_silver:"Silver",color_red:"Red",color_orange:"Orange",color_yellow:"Yellow",color_green:"Green",color_turquoise:"Turquoise",color_cyan:"Cyan",color_blue:"Blue",color_purple:"Purple",color_pink:"Pink",color_brown:"Brown",color_beige:"Beige",color_gold:"Gold",offer_empty:"Bambu Studio offers no filament for this slot with the nozzle that feeds it. A profile can be set on the printer or in BamBuddy.",offer_failed:"The filament list did not arrive. To ask again, close the dialog and open it once more.",filament_mid_print:"{printer} is printing from this slot. Setting this changes it mid-print.",filament_set:"Set",filament_rfid_linked:"A Bambu Lab spool with its chip: the AMS reads material and color from the chip, and BamBuddy assigned it to the spool above by that chip.",filament_rfid:"A Bambu Lab spool with a chip: the AMS reads its material and color from the chip.",k_profile:"K profile (flow dynamics)",k_keep:"Keep {profile}",k_about:"The printer's default and the K profiles saved on the printer for this filament.",k_default:"Printer's default (K {k})",k_matching:"Matching {material}",k_loading:"Asking the printer for its K profiles \u2026",k_slow:"The printer does not answer at once. BamBuddy asks up to three times, which takes about 16 seconds at most.",k_none_saved:"No K profiles of your own are saved on the printer for the {diameter} nozzle diameter. Profiles of your own, for example from the flow dynamics calibration in Bambu Studio or from BamBuddy, show here. Until then the printer uses its default.",k_no_answer:"The printer did not answer in time. To ask again, close the dialog and open it once more.",reset_in_use:"The paused print takes its filament from this slot.",reset_in_use_spool:"The paused print takes its filament from this spool.",hms_next_answers:"Check the print, then answer here as on the printer's screen.",k_keep_number:"Keep K profile no. {index}",k_keep_plain:"Keep the slot's own",k_failed:"The printer did not list its K profiles: the slot keeps its own.",k_unsure:"If unsure, leave this as it is.",rfid_read:"Read the chip again",rfid_unload_hint:"Re-reading the chip works only while no filament is loaded. Filament from {slots} is loaded now: unload it first.",plug_turn_off:"Turn off",plug_turn_on:"Turn on",plug_turn_off_named:"Turn off \u201C{plug}\u201D",plug_turn_on_named:"Turn on \u201C{plug}\u201D",load_from:"Load from {place}",load_from_external:"Load from the external spool",load_from_left:"Load from the left external spool",load_from_right:"Load from the right external spool",dry_named:"Dry {unit}",dry_stop_named:"Stop drying {unit}",rfid_unload_hint_external:"Re-reading the chip works only while no filament is loaded. Filament from the external spool is loaded now: unload it first.",rfid_unload_hint_left:"Re-reading the chip works only while no filament is loaded. Filament from the left external spool is loaded now: unload it first.",rfid_unload_hint_right:"Re-reading the chip works only while no filament is loaded. Filament from the right external spool is loaded now: unload it first.",k_keep_plain_spool:"Keep the spool's own",k_failed_spool:"The printer did not list its K profiles: the spool keeps its own.",slot_reset:"Reset slot",spool_reset:"Reset spool",slot_tools_running:"Pause the print first to reset the slot or read its chip again.",spool_tools_running:"Pause the print first to reset the spool.",reset_title:"Reset the slot?",reset_text:"Its material and color are cleared. A spool with a chip shows again once the AMS reads the chip.",reset_title_spool:"Reset the spool?",reset_text_spool:"Its material and color are cleared.",reset_confirm:"Reset",filament_need_filament:"Choose a filament too.",dur_min:"{m} min",dur_h:"{h} h",dur_hm:"{h} h {m} min",dur_dh:"{d} d {h} h",dur_d:"{d} d",hours:"h",maint_ok:"Maintenance OK",maint_due:"Maintenance: {n} due",maint_due_soon:"Maintenance: {n} due soon",maint_ok_aria:"Maintenance OK \u2013 nothing due",maint_due_aria:"{shown} \u2013 {parts}",maint_part_overdue:"{n} overdue",maint_part_soon:"{n} due soon",door_open:"Door open",storage_sd:"No SD card",storage_usb:"No USB drive",storage_sd_chip_title:"No SD card \u2013 BamBuddy cannot send prints to the printer",storage_usb_chip_title:"No USB drive \u2013 BamBuddy cannot send prints to the printer",storage_sd_title_in:"SD card",storage_usb_title_in:"USB drive",storage_sd_text:"Without an SD card BamBuddy cannot send prints to the printer, and prints are archived without a thumbnail. Insert a microSD card.",storage_usb_text:"Without a USB drive BamBuddy cannot send prints to the printer, and prints are archived without a thumbnail. Insert a USB drive.",storage_sd_in:"The SD card is in: BamBuddy can send prints again.",storage_usb_in:"The USB drive is in: BamBuddy can send prints again.",dry_chip_one_bare:"Drying",dry_chip_many_bare:"{n} AMS drying",dry_chip_aria:"{n} AMS units drying, all done in {time}",dry_chip_unit:"{unit} drying",dry_chip_unit_aria:"{unit} drying, done in {time}",dry_chip_many_short:"{n}\xD7",maint_title:"Maintenance",maint_never:"Never marked as done",maint_overdue:"{time} overdue",maint_soon:"Due soon: in {time}",maint_in:"Due in {time}",maint_done:"Done",maint_done_aria:"Mark \u201C{task}\u201D as done",maint_confirm:"Mark as done? The count starts over.",maint_hours:"Print hours: {hours}",maint_note:"You set up tasks and intervals in BamBuddy.",maint_all_never:"BamBuddy counts from 0 h until a task has been marked done once. Mark what you have done already.",maint_all_never_hidden:"BamBuddy counts from 0 h until a task has been marked done once. You can mark tasks done in BamBuddy \u2013 this card hides its controls.",maint_none:"No maintenance tasks.",maint_task_clean_build_plate:"Clean build plate",maint_task_clean_nozzle:"Clean nozzle and hotend",maint_task_belt_tension:"Check belt tension",maint_task_ptfe_tube:"Check PTFE tube",maint_task_clean_carbon_rods:"Clean carbon rods",maint_task_lubricate_steel_rods:"Lubricate steel rods",maint_task_clean_steel_rods:"Clean steel rods",maint_task_lubricate_rails:"Lubricate linear rails",maint_task_clean_rails:"Clean linear rails",check_again:"Check again",check_running:"Checking the connection \u2026 {s} s",check_running_sr:"Checking the connection \u2026",check_running_hint:"This usually takes a few seconds, at most half a minute.",check_error:"The check could not run: {error}",check_ok:"No problems found.",check_warnings_one:"The printer should work, but 1 thing needs attention.",check_warnings:"The printer should work, but {n} things need attention.",check_problems_one:"1 problem found.",check_problems:"{n} problems found.",check_passed_one:"1 check passed",check_passed:"{n} checks passed",check_skipped:"{n} not checked",check_follows:"Usually follows from the problem above.",check_skip:"Not checked.",check_port_mqtt:"Control (port 8883)",check_port_mqtt_fail:"Not reachable. Is the printer on and still at the same IP address? Is a firewall blocking the port?",check_port_ftps:"File transfer (port 990)",check_port_ftps_warn:"Not reachable: BamBuddy cannot send prints.",check_port_ftps_warn_fix:"Unblock port 990.",check_port_ftps_warn_no_tls:"Port open, but the printer's file service hangs. Restart the printer.",check_port_rtsps:"Camera (port {port})",check_port_rtsps_warn:"Not reachable: no live view. Printing still works.",check_macos_local_network:"macOS: local network",check_macos_local_network_warn_unsigned:"macOS silently blocks the connection. Run BamBuddy's update script (install/update_macos.sh) and restart BamBuddy.",check_macos_local_network_warn_permission:"Allow BamBuddy's Python under System Settings \u2192 Privacy & Security \u2192 Local Network.",check_network_mode:"Container network",check_network_mode_warn:"BamBuddy runs on a bridge network. Printer discovery needs host networking (\u201Cnetwork_mode: host\u201D).",check_network_mode_skip:"Not in a container.",check_network_mode_skip_unknown:"In a container ({runtime}); its network mode could not be determined.",check_network_mode_skip_system_container:"In a system container ({runtime}): not applicable.",check_subnet:"Subnet",check_subnet_warn:"The printer ({printer_ip}) and BamBuddy ({host_ip}) are on different subnets. This works only with routing between them.",check_subnet_skip:"Could not be determined.",check_external_storage:"Files on external storage",check_external_storage_fail:"Off on the printer: archives get no thumbnail. Turn on \u201CStore sent files on external storage\u201D \u2013 in the printer's print settings or in the slicer's Device tab.",check_external_storage_fail_no_media:"No SD card or USB drive in the printer: prints cannot be sent. Insert one.",check_external_storage_warn_internal_storage:"The last print sat in internal storage, which BamBuddy cannot read: it was archived without a thumbnail. Start prints from BamBuddy, or use \u201CSend\u201D with \u201CExternal\u201D in the slicer.",check_external_storage_warn_internal_history:"The last print came from the printer's own storage: archived without a thumbnail. Start prints from BamBuddy or the slicer.",check_external_storage_skip_unsupported_model:"Cannot be set on the P1. Nothing to do.",check_mqtt_auth:"Credentials",check_mqtt_auth_fail:"Reachable but not connected. Usually the access code changed: it does whenever LAN Only or Developer Mode is switched. Enter it again in BamBuddy.",check_mqtt_auth_fail_auth_rejected:"The printer rejects the access code or serial number. Read the access code on its screen and enter it again in BamBuddy.",check_mqtt_auth_skip:"Not checked: port 8883 cannot be reached.",check_developer_mode:"Developer mode (LAN)",check_developer_mode_skip:"Not checked: needs a live connection to the printer.",check_printer_publishing:"Status reports",check_printer_publishing_fail:"Connected, but the printer reports nothing. Usually the serial number in BamBuddy is mistyped (case matters).",check_printer_publishing_skip:"Not checked: needs a live connection to the printer.",ventilation:"Ventilation",vent_fans_exhaust:"Exhaust fan",vent_fans_right_aux_exhaust:"Right auxiliary fan and exhaust fan",vent_fans_aux:"Auxiliary fan",vent_fans_aux_exhaust:"Auxiliary fan and exhaust fan",vent_chamber_heats:"While the chamber heats, it cannot be ventilated. First switch the chamber off under Heating above.",chamber_vent_on:"While the chamber is ventilated, it cannot be heated. First switch the chamber off under Ventilation below.",keep_warm_vent_on:"While the chamber is ventilated, it cannot be kept warm. First switch the chamber off under Ventilation below.",chamber_cooling_print:"The printer prints in cooling mode: the chamber can be heated once the print is done.",vent_print_cooling:"During a print the printer also sets this fan itself and may change the speed again.",vent_print_cooling_two:"During a print the printer also sets these fans itself and may change the speed again.",vent_heating_print:"The printer prints in heating mode: ventilation is possible once the print is done.",vent_keep_warm:"While the chamber is kept warm, it cannot be ventilated. First switch the chamber off under Heating above.",heat_vent_hint:"Heating keeps the warmth in the chamber (ABS, ASA, PC, PA), ventilation draws fresh air in (PLA, TPU). The printer sets this itself at every print start.",tile_vent:"Ventilation {value}",keep_warm:"Keep warm",vent_lower:"Ventilation {step}\xA0% less",vent_raise:"Ventilation {step}\xA0% more",vent_start:"Ventilate at {value}",vent_off:"Switch ventilation off",vent_said:"Ventilation, speed:",airduct_laser_idle:"The printer is still in laser mode (for its laser module). Ventilating switches it to cooling.",airduct_laser_now:"Now in laser mode: the printer sets it for its laser module.",airduct_busy:"Can be changed once the print is done.",backup:"AMS filament backup",backup_sub:"When a spool runs out, the printer continues with a matching spool from the AMS: same brand, material and color.",backup_dual:"With two nozzles, only spools on the same side.",backup_unknown:"State unknown: BamBuddy does not report it for this printer. Switching it on or off still works.",backup_turn_off:"Turn off",backup_turn_on:"Turn on",on:"On",off:"Off",block_power:"Power",chip_power:"Power",power_title:"Power",plug_printer_tag:"Printer",plug_today:"today {energy}",plug_unreachable:"Not reachable: BamBuddy gets no answer from the plug.",plug_unknown:"State unknown: the plug does not report it.",plug_run:"Run",plug_script:"Script in Home Assistant",plug_monitor:"Display only: BamBuddy cannot switch this plug.",plug_off_title_printer:"Switch the printer off?",plug_off_text_printer:"The plug \u201C{plug}\u201D cuts the power. BamBuddy then shows the printer as offline; after switching it on, it is back in about a minute.",plug_off_hot:"The nozzle is still at {temperature}: without power, its fan stops too.",plug_off_hot_left:"The left nozzle is still at {temperature}: without power, its fan stops too.",plug_off_hot_right:"The right nozzle is still at {temperature}: without power, its fan stops too.",plug_off_title_print:"Cancel the print and switch off?",plug_off_text_print:"\u201C{job}\u201D is at {progress}. Without power the print stops and cannot be resumed.",plug_off_text_print_plain:"Without power the print stops and cannot be resumed.",plug_off_print_note:"Only in an emergency. Otherwise stop the print first and let the nozzle cool.",plug_off_keep:"Keep it on",plug_off_text_offline:"BamBuddy cannot reach the printer and does not know whether it is printing. The plug delivers {power} \u2013 a running print would stop without power.",plug_off_text_offline_plain:"BamBuddy cannot reach the printer and does not know whether it is printing. A running print would stop without power.",plug_off_text_offline_idle:"BamBuddy cannot reach the printer. The plug delivers {power} \u2013 about what an idle printer draws, so it is most likely not printing.",plug_off_confirm:"Switch off",plug_off_title:"Switch \u201C{plug}\u201D off?",plug_off_text:"Everything plugged into it loses power.",auto_off_title:"Switch off after the print",auto_off_every:"After every print, once the nozzle is below {temperature}.",auto_off_next:"After the next print, once the nozzle is below {temperature}.",auto_off_disarmed:"The printer stays on after the print.",auto_off_waiting_title:"Waiting to switch off",auto_off_waiting_short:"Waiting",auto_off_waiting:"Once the nozzle is below {temperature} \xB7 now {now}",auto_off_waiting_drying:"Waits until the AMS has finished drying.",auto_off_skip:"Don't switch off this time",auto_off_skipped:"The printer stays on this time; it switches off again after the next print.",auto_off_failed:"Print stopped or failed \u2013 the printer stays on this time.",auto_off_failed_next:"Print stopped or failed \u2013 the printer stays on.",auto_off_gave_up:"Not switched off: the printer was not ready within two hours (the nozzle stayed hot, the AMS was drying, a target was set or BamBuddy lost the printer), or the plug did not answer.",auto_off_bambuddy:"BamBuddy already switches this plug off after the print (Auto Off). To set it here instead, turn Auto Off off in BamBuddy.",auto_off_bambuddy_view:"BamBuddy already switches this plug off after the print (Auto Off).",auto_off_done_at:"Switched off after the print at {time}.",auto_off_temperature:"Switch off once the nozzle is cooler than",auto_off_when:"When",auto_off_every_choice:"After every print",auto_off_next_choice:"Only after the next print",auto_off_dialog_note:"Only after a finished print \u2013 never during a print or a pause, never while the AMS changes filament or dries.",offline_plug_off:"The printer is off: its plug \u201C{plug}\u201D is switched off.",power_on:"Switch the printer on",power_starting:"Printer starting \u2026 {time}",power_starting_text:"BamBuddy usually connects after about a minute.",power_plug_on:"Plug on \xB7 {power}",offline_plug_on_power:"The plug delivers power ({power}), but BamBuddy cannot reach the printer.",offline_plug_on_zero:"The plug shows 0 W: is the printer's own power switch off?",chip_power_off:"Power off",chip_power_unreachable:"Plug unreachable",chip_power_on:"Power on",chip_power_plug:"{plug} \xB7 {power}",chip_power_plug_state:"{plug}: {state}",chip_power_unknown:"Power unknown",chip_power_unreachable_short:"Unreachable",chip_power_unknown_short:"Unknown",chip_power_aria:"{shown} \u2013 plug \u201C{plug}\u201D",editor_show_auto_off:"\u201CSwitch off after the print\u201D row",editor_show_auto_off_help:"Shows or hides the row under the printer's plug in the Power section and the Power chip's dialog. In it you choose whether the printer switches itself off after the print. With the row hidden, it still switches off if set to.",auto_off_lower:"Lower the switch-off temperature by {step}\xA0{unit}",auto_off_raise:"Raise the switch-off temperature by {step}\xA0{unit}",auto_off_waiting_filament:"Waits until the AMS has changed the filament.",auto_off_waiting_heating:"Waits: a target temperature is set on the printer.",auto_off_waiting_printer:"Waits until BamBuddy reaches the printer again.",auto_off_waiting_plug:"Waits until the plug answers.",auto_off_switching:"Switching off \u2026",power_off_plug:"Switch the plug off",plug_run_named:"Run \u201C{plug}\u201D"};var _e={en:Li,de:Di},Qo=t=>t in _e,Hi="en",es=t=>{let e=t.toLowerCase().replace(/[-_].*$/,"");return Qo(e)?e:"en"};function be(t){let e=t??document.querySelector("home-assistant")?.hass;return e?es(e.locale.language):Hi}function Ei(t){Hi=be(t)}function s(t,e,n={}){return _e[be(t)][e].replace(/\{(\w+)\}/g,(i,r)=>r in n?String(n[r]):i)}async function un(t,e,n,i){await t.callService(e,n,i,void 0,!1)}async function Ie(t,e){let n=typeof e=="object"&&e!==null?e:{},i=n.translation_domain,r=n.translation_key;if(i&&r)try{let a=(await t.loadBackendTranslation("exceptions",i))(`component.${i}.exceptions.${r}.message`,n.translation_placeholders??{});if(a)return a}catch{}return typeof n.message=="string"&&n.message?n.message:s(t,"error_generic")}async function we(t,e,n){return(await t.callService("bambuddy",e,n,void 0,!1,!0))?.response??{}}var de=(t,e,n)=>(Array.isArray(t)?t:[]).filter(i=>typeof i=="object"&&i!==null&&typeof i[e]===n);async function Ri(t,e){let n=await we(t,"get_k_profiles",{entity_id:e}),i=Number(n.nozzle_diameter);return{current:typeof n.current=="number"?n.current:-1,answered:n.answered!==!1,...Number.isFinite(i)&&i>0?{diameter:i}:{},profiles:de(n.profiles,"index","number").map(r=>({index:r.index,name:typeof r.name=="string"?r.name:"",k:typeof r.k_value=="number"?r.k_value:0,filamentId:typeof r.filament_id=="string"?r.filament_id:""}))}}async function Mi(t,e){let n=await we(t,"get_filaments",{entity_id:e});if(!Array.isArray(n.vendors))return;let i=de(n.vendors,"name","string").map(r=>({name:r.name,filaments:de(r.filaments,"id","string").map(o=>({id:o.id,name:typeof o.name=="string"?o.name:o.id,type:typeof o.type=="string"?o.type:""}))}));return{...typeof n.current=="string"?{current:n.current}:{},vendors:i}}var ts=new Set(["not_for_ams","not_for_nozzle","not_for_printer","by_chip","printing"]);function Bi(t){if(typeof t!="object"||t===null)return;let e=t;if(e.this_slot===!0)return{here:!0};let{printer_id:n,ams_id:i,tray_id:r}=e;if(!(typeof n!="number"||typeof i!="number"||typeof r!="number"))return{here:!1,printerId:n,printerName:typeof e.printer_name=="string"?e.printer_name:String(n),amsId:i,trayId:r,...typeof e.ams_label=="string"&&e.ams_label?{amsLabel:e.ams_label}:{},samePrinter:e.same_printer===!0}}var hn=t=>(Array.isArray(t)?t:[]).map(Bi).filter(e=>e!==void 0&&!e.here);async function Oi(t,e){let n=await we(t,"get_spools",{entity_id:e});if(!Array.isArray(n.spools))return;let i=a=>typeof a=="string"&&a?a:void 0,r=de(n.spools,"id","number").map(a=>{let d=Bi(a.place),l=a.fits,p=a.remaining_pct,h=a.remaining_g;return{id:a.id,name:i(a.name)??String(a.id),brand:i(a.brand)??"",material:i(a.material)??"",...i(a.color_name)?{colorName:i(a.color_name)}:{},...i(a.rgba)?{rgba:i(a.rgba)}:{},extraColors:Array.isArray(a.extra_colors)?a.extra_colors.filter(f=>typeof f=="string"):[],remainingG:typeof h=="number"?h:0,...typeof p=="number"?{remainingPct:p}:{},...i(a.storage_location)?{storage:i(a.storage_location)}:{},rfid:a.rfid===!0,...d?{place:d}:{},also:hn(a.also),...typeof l=="string"&&ts.has(l)?{fits:l}:{},...i(a.printing)?{printing:i(a.printing)}:{},...i(a.type)?{type:i(a.type)}:{}}}),o=n.assigned;return{...typeof o=="number"?{assigned:o}:{},spools:r}}async function Fi(t,e){let n=await we(t,"get_print_objects",{device_id:e});return de(n.objects,"id","number").map(i=>({id:i.id,name:typeof i.name=="string"?i.name:"",skipped:i.skipped===!0}))}var Pi=new Set(["unavailable","unknown"]),v=(t,e)=>e?t.states[e]:void 0;function R(t,e){let n=v(t,e);return!!n&&!Pi.has(n.state)}function S(t,e){let n=v(t,e);if(!n||n.state.trim()==="")return;let i=Number(n.state);return Number.isFinite(i)?i:void 0}var ns={d:1440,h:60,min:1,s:1/60,ms:1/6e4};function ve(t,e){let n=S(t,e),i=v(t,e)?.attributes.unit_of_measurement;return n===void 0?void 0:n*(ns[typeof i=="string"?i:"min"]??1)}function V(t,e){let n=v(t,e)?.attributes.unit_of_measurement;return n==="\xB0F"||n==="K"?n:"\xB0C"}var G=(t,e)=>Math.round(e==="\xB0F"?t*1.8+32:e==="K"?t+273.15:t);function ce(t,e){let n=v(t,e)?.attributes.min;return typeof n=="number"?n:0}var ye=t=>typeof t=="string"&&t?t:void 0;function xe(t,e,n){let i=t.attributes.options;return Array.isArray(i)&&(n||i.length>0)&&i.every(r=>typeof r=="string")?i:e}function M(t,e,n){let i=v(t,e);if(!(!i||n===void 0&&Pi.has(i.state)))return n===void 0?t.formatEntityState(i):t.formatEntityState(i,n)}function Ni(t){switch(t.locale.number_format){case"comma_decimal":return"en-US";case"decimal_comma":return"de";case"space_comma":return"fr";case"quote_decimal":return"de-CH";case"system":return;default:return t.locale.language}}function T(t,e,n=0){return new Intl.NumberFormat(Ni(t),{maximumFractionDigits:n,useGrouping:t.locale.number_format!=="none"}).format(e)}var H=(t,e,n="\xB0C")=>`${T(t,e)}\xA0${n}`,N=(t,e,n)=>H(t,n,V(t,e));function fn(t,e,n){return new Intl.NumberFormat(Ni(t),{minimumFractionDigits:n,maximumFractionDigits:n}).format(e)}var z=(t,e)=>`${T(t,e)}\xA0%`,ke=(t,e)=>Math.abs(e)>=1e3?`${T(t,e/1e3,1)}\xA0kW`:`${T(t,e)}\xA0W`,Vi=(t,e)=>`${T(t,e,2)}\xA0kWh`;function q(t,e){let n=Math.max(0,Math.round(e)),i=Math.floor(n/1440),r=Math.floor(n%1440/60),o=n%60;return i>0?r===0?s(t,"dur_d",{d:i}):s(t,"dur_dh",{d:i,h:r}):r===0?s(t,"dur_min",{m:o}):o===0?s(t,"dur_h",{h:r}):s(t,"dur_hm",{h:r,m:o})}function is(t){switch(t.locale.time_format){case"12":return!0;case"24":return!1;case"system":return new Intl.DateTimeFormat(void 0,{hour:"numeric"}).resolvedOptions().hour12;default:return}}function rs(t){return t.locale.time_zone==="server"?t.config?.time_zone:void 0}function dt(t,e,n=new Date){let i=new Date(e);if(Number.isNaN(i.getTime()))return;let r=rs(t),o=t.locale.language,a=l=>new Intl.DateTimeFormat("en-CA",{timeZone:r,dateStyle:"short"}).format(l),d=a(i)===a(n);return new Intl.DateTimeFormat(o,{timeZone:r,hour:"numeric",minute:"2-digit",hour12:is(t),...d?{}:{weekday:"short"}}).format(i)}var Y=new Set(["printing","paused","preparing","slicing"]),Ii=new Set(["printing","preparing","slicing"]),Ki=new Set(["heating","feeding","retracting","verifying","purging","changing_filament"]),ct=new Set(["printing","paused","preparing","slicing","finished","failed"]);function mn(t){switch(t){case"printing":case"preparing":case"slicing":return"active";case"paused":return"paused";case"finished":return"done";case"failed":return"failed";case"idle":return"idle";default:return"off"}}function ji(t){return typeof t=="string"&&/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(t)?t.slice(0,7):void 0}var gn=t=>[1,3,5].map(e=>parseInt(t.slice(e,e+2),16));function os(t){let[e,n,i]=gn(t).map(r=>r/255);return .2126*e+.7152*n+.0722*i}function Ke(t){let e=os(t);return e>.85||e<.12}var pt=t=>t.replace(/(\.gcode)?\.(3mf|gcode)$/i,"")||t;var ss={pause:"M14,19H18V5H14M6,19H10V5H6V19Z",play:"M8,5.14V19.14L19,12.14L8,5.14Z",stop:"M18,18H6V6H18V18Z",lightOn:"M12,6A6,6 0 0,1 18,12C18,14.22 16.79,16.16 15,17.2V19A1,1 0 0,1 14,20H10A1,1 0 0,1 9,19V17.2C7.21,16.16 6,14.22 6,12A6,6 0 0,1 12,6M14,21V22A1,1 0 0,1 13,23H11A1,1 0 0,1 10,22V21H14M20,11H23V13H20V11M1,11H4V13H1V11M13,1V4H11V1H13M4.92,3.5L7.05,5.64L5.63,7.05L3.5,4.93L4.92,3.5M16.95,5.63L19.07,3.5L20.5,4.93L18.37,7.05L16.95,5.63Z",lightOff:"M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21M12,4A5,5 0 0,0 7,9C7,11.05 8.23,12.81 10,13.58V16H14V13.58C15.77,12.81 17,11.05 17,9A5,5 0 0,0 12,4Z",nozzle:"M7,2H17V8H19V13H16.5L13,17H11L7.5,13H5V8H7V2M10,22H2V20H10A1,1 0 0,0 11,19V18H13V19A3,3 0 0,1 10,22Z",bed:"M7.95,3L6.53,5.19L7.95,7.4H7.94L5.95,10.5L4.22,9.6L5.64,7.39L4.22,5.19L6.22,2.09L7.95,3M13.95,2.89L12.53,5.1L13.95,7.3L13.94,7.31L11.95,10.4L10.22,9.5L11.64,7.3L10.22,5.1L12.22,2L13.95,2.89M20,2.89L18.56,5.1L20,7.3V7.31L18,10.4L16.25,9.5L17.67,7.3L16.25,5.1L18.25,2L20,2.89M2,22V14A2,2 0 0,1 4,12H20A2,2 0 0,1 22,14V22H20V20H4V22H2M6,14A1,1 0 0,0 5,15V17A1,1 0 0,0 6,18A1,1 0 0,0 7,17V15A1,1 0 0,0 6,14M10,14A1,1 0 0,0 9,15V17A1,1 0 0,0 10,18A1,1 0 0,0 11,17V15A1,1 0 0,0 10,14M14,14A1,1 0 0,0 13,15V17A1,1 0 0,0 14,18A1,1 0 0,0 15,17V15A1,1 0 0,0 14,14M18,14A1,1 0 0,0 17,15V17A1,1 0 0,0 18,18A1,1 0 0,0 19,17V15A1,1 0 0,0 18,14Z",chamber:"M15 13V5A3 3 0 0 0 9 5V13A5 5 0 1 0 15 13M12 4A1 1 0 0 1 13 5V8H11V5A1 1 0 0 1 12 4Z",fan:"M12,11A1,1 0 0,0 11,12A1,1 0 0,0 12,13A1,1 0 0,0 13,12A1,1 0 0,0 12,11M12.5,2C17,2 17.11,5.57 14.75,6.75C13.76,7.24 13.32,8.29 13.13,9.22C13.61,9.42 14.03,9.73 14.35,10.13C18.05,8.13 22.03,8.92 22.03,12.5C22.03,17 18.46,17.1 17.28,14.73C16.78,13.74 15.72,13.3 14.79,13.11C14.59,13.59 14.28,14 13.88,14.34C15.87,18.03 15.08,22 11.5,22C7,22 6.91,18.42 9.27,17.24C10.25,16.75 10.69,15.71 10.89,14.79C10.4,14.59 9.97,14.27 9.65,13.87C5.96,15.85 2,15.07 2,11.5C2,7 5.56,6.89 6.74,9.26C7.24,10.25 8.29,10.68 9.22,10.87C9.41,10.39 9.73,9.97 10.14,9.65C8.15,5.96 8.94,2 12.5,2Z",home:"M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z",up:"M13,20H11V8L5.5,13.5L4.08,12.08L12,4.16L19.92,12.08L18.5,13.5L13,8V20Z",down:"M11,4H13V16L18.5,10.5L19.92,11.92L12,19.84L4.08,11.92L5.5,10.5L11,16V4Z",left:"M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z",right:"M4,11V13H16L10.5,18.5L11.92,19.92L19.84,12L11.92,4.08L10.5,5.5L16,11H4Z",chevronRight:"M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z",chevronDown:"M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z",humidity:"M12,3.25C12,3.25 6,10 6,14C6,17.32 8.69,20 12,20A6,6 0 0,0 18,14C18,10 12,3.25 12,3.25M14.47,9.97L15.53,11.03L9.53,17.03L8.47,15.97M9.75,10A1.25,1.25 0 0,1 11,11.25A1.25,1.25 0 0,1 9.75,12.5A1.25,1.25 0 0,1 8.5,11.25A1.25,1.25 0 0,1 9.75,10M14.25,14.5A1.25,1.25 0 0,1 15.5,15.75A1.25,1.25 0 0,1 14.25,17A1.25,1.25 0 0,1 13,15.75A1.25,1.25 0 0,1 14.25,14.5Z",error:"M13 13H11V7H13M11 15H13V17H11M15.73 3H8.27L3 8.27V15.73L8.27 21H15.73L21 15.73V8.27L15.73 3Z",warning:"M13 14H11V9H13M13 18H11V16H13M1 21H23L12 2L1 21Z",info:"M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",wrench:"M22.7,19L13.6,9.9C14.5,7.6 14,4.9 12.1,3C10.1,1 7.1,0.6 4.7,1.7L9,6L6,9L1.6,4.7C0.4,7.1 0.9,10.1 2.9,12.1C4.8,14 7.5,14.5 9.8,13.6L18.9,22.7C19.3,23.1 19.9,23.1 20.3,22.7L22.6,20.4C23.1,20 23.1,19.3 22.7,19Z",doorOpen:"M12,3C10.89,3 10,3.89 10,5H3V19H2V21H22V19H21V5C21,3.89 20.11,3 19,3H12M12,5H19V19H12V5M5,11H7V13H5V11Z",sd:"M18,8H16V4H18M15,8H13V4H15M12,8H10V4H12M18,2H10L4,8V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V4A2,2 0 0,0 18,2Z",usb:"M15,7V11H16V13H13V5H15L12,1L9,5H11V13H8V10.93C8.7,10.56 9.2,9.85 9.2,9C9.2,7.78 8.21,6.8 7,6.8C5.78,6.8 4.8,7.78 4.8,9C4.8,9.85 5.3,10.56 6,10.93V13A2,2 0 0,0 8,15H11V18.05C10.29,18.41 9.8,19.15 9.8,20A2.2,2.2 0 0,0 12,22.2A2.2,2.2 0 0,0 14.2,20C14.2,19.15 13.71,18.41 13,18.05V15H16A2,2 0 0,0 18,13V11H19V7H15Z",tune:"M3,17V19H9V17H3M3,5V7H13V5H3M13,21V19H21V17H13V15H11V21H13M7,9V11H3V13H7V15H9V9H7M21,13V11H11V13H21M15,9H17V7H21V5H17V3H15V9Z",lan:"M10,2C8.89,2 8,2.89 8,4V7C8,8.11 8.89,9 10,9H11V11H2V13H6V15H5C3.89,15 3,15.89 3,17V20C3,21.11 3.89,22 5,22H9C10.11,22 11,21.11 11,20V17C11,15.89 10.11,15 9,15H8V13H16V15H15C13.89,15 13,15.89 13,17V20C13,21.11 13.89,22 15,22H19C20.11,22 21,21.11 21,20V17C21,15.89 20.11,15 19,15H18V13H22V11H13V9H14C15.11,9 16,8.11 16,7V4C16,2.89 15.11,2 14,2H10M10,4H14V7H10V4M5,17H9V20H5V17M15,17H19V20H15V17Z",fullscreen:"M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z",fullscreenExit:"M14,14H19V16H16V19H14V14M5,14H10V19H8V16H5V14M8,5H10V10H5V8H8V5M19,8V10H14V5H16V8H19Z",close:"M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z",cog:"M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z",video:"M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z",videoOff:"M3.27,2L2,3.27L4.73,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16C16.2,18 16.39,17.92 16.54,17.82L19.73,21L21,19.73M21,6.5L17,10.5V7A1,1 0 0,0 16,6H9.82L21,17.18V6.5Z",load:"M2 12H4V17H20V12H22V17C22 18.11 21.11 19 20 19H4C2.9 19 2 18.11 2 17V12M12 15L17.55 9.54L16.13 8.13L13 11.25V2H11V11.25L7.88 8.13L6.46 9.55L12 15Z",unload:"M2 12H4V17H20V12H22V17C22 18.11 21.11 19 20 19H4C2.9 19 2 18.11 2 17V12M12 2L6.46 7.46L7.88 8.88L11 5.75V15H13V5.75L16.13 8.88L17.55 7.45L12 2Z",speed:"M12,16A3,3 0 0,1 9,13C9,11.88 9.61,10.9 10.5,10.39L20.21,4.77L14.68,14.35C14.18,15.33 13.17,16 12,16M12,3C13.81,3 15.5,3.5 16.97,4.32L14.87,5.53C14,5.19 13,5 12,5A8,8 0 0,0 4,13C4,15.21 4.89,17.21 6.34,18.65H6.35C6.74,19.04 6.74,19.67 6.35,20.06C5.96,20.45 5.32,20.45 4.93,20.07V20.07C3.12,18.26 2,15.76 2,13A10,10 0 0,1 12,3M22,13C22,15.76 20.88,18.26 19.07,20.07V20.07C18.68,20.45 18.05,20.45 17.66,20.06C17.27,19.67 17.27,19.04 17.66,18.65V18.65C19.11,17.2 20,15.21 20,13C20,12 19.81,11 19.46,10.1L20.67,8C21.5,9.5 22,11.18 22,13Z",check:"M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z",restore:"M13,3A9,9 0 0,0 4,12H1L4.89,15.89L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3Z",ready:"M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",skip:"M16,18H18V6H16M6,18L14.5,12L6,6V18Z",sync:"M12,18A6,6 0 0,1 6,12C6,11 6.25,10.03 6.7,9.2L5.24,7.74C4.46,8.97 4,10.43 4,12A8,8 0 0,0 12,20V23L16,19L12,15M12,4V1L8,5L12,9V6A6,6 0 0,1 18,12C18,13 17.75,13.97 17.3,14.8L18.76,16.26C19.54,15.03 20,13.57 20,12A8,8 0 0,0 12,4Z",plug:"M16,7V3H14V7H10V3H8V7C7,7 6,8 6,9V14.5L9.5,18V21H14.5V18L18,14.5V9C18,8 17,7 16,7Z",plugOff:"M8,3V6.18C11.1,9.23 14.1,12.3 17.2,15.3C17.4,15 17.8,14.8 18,14.4V9C18,8 17,7 16,7V3H14V7H10V3M3.28,4C2.85,4.4 2.85,5.16 3.28,5.53L6,8.25V14.5L9.5,18V21H14.5V18L15.47,17.03L18.27,19.83C18.64,20.22 19.38,20.22 19.8,19.83C20.24,19.4 20.24,18.65 19.8,18.21L4.83,3.24C4.4,2.82 3.7,2.82 3.28,3.24",bolt:"M11 15H6L13 1V9H18L11 23V15Z",script:"M14 20A2 2 0 0 0 16 18V5H9A1 1 0 0 0 8 6V16H5V5A3 3 0 0 1 8 2H19A3 3 0 0 1 22 5V6H18V18L18 19A3 3 0 0 1 15 22H5A3 3 0 0 1 2 19V18H12A2 2 0 0 0 14 20M10 13V8L14 10.5Z",timerOff:"M19.04 4.55L17.62 5.97C16.07 4.74 14.12 4 12 4C9.17 4 6.65 5.31 5 7.36L6.43 8.79C7.71 7.08 9.72 6 12 6C15.87 6 19 9.13 19 13C19 14.15 18.72 15.24 18.22 16.2L19.69 17.67C20.53 16.32 21 14.72 21 13C21 10.88 20.26 8.93 19.03 7.39L20.45 5.97L19.04 4.55M15 1H9V3H15V1M11 9.17L13 11.17V8H11V9.17M3.02 4L1.75 5.27L4.5 8.03C3.55 9.45 3 11.16 3 13C3 17.97 7.03 22 12 22C13.84 22 15.55 21.45 17 20.5L19.5 23L20.75 21.73L3.02 4M12 20C8.13 20 5 16.87 5 13C5 11.72 5.35 10.5 5.95 9.5L15.5 19.04C14.5 19.65 13.28 20 12 20Z",power:"M16.56,5.44L15.11,6.89C16.84,7.94 18,9.83 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12C6,9.83 7.16,7.94 8.88,6.88L7.44,5.44C5.36,6.88 4,9.28 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,9.28 18.64,6.88 16.56,5.44M13,3H11V13H13",heat:"M8.5 4.5L5.4 9.5L8.5 14.7L5.2 20.5L3.4 19.6L6.1 14.7L3 9.5L6.7 3.6L8.5 4.5M14.7 4.4L11.6 9.5L14.7 14.5L11.4 20.3L9.6 19.4L12.3 14.5L9.2 9.5L12.9 3.5L14.7 4.4M21 4.4L17.9 9.5L21 14.5L17.7 20.3L15.9 19.4L18.6 14.5L15.5 9.5L19.2 3.5L21 4.4",layers:"M12,16L19.36,10.27L21,9L12,2L3,9L4.63,10.27M12,18.54L4.62,12.81L3,14.07L12,21.07L21,14.07L19.37,12.8L12,18.54Z",timer:"M12,20A7,7 0 0,1 5,13A7,7 0 0,1 12,6A7,7 0 0,1 19,13A7,7 0 0,1 12,20M19.03,7.39L20.45,5.97C20,5.46 19.55,5 19.04,4.56L17.62,6C16.07,4.74 14.12,4 12,4A9,9 0 0,0 3,13A9,9 0 0,0 12,22C17,22 21,17.97 21,13C21,10.88 20.26,8.93 19.03,7.39M11,14H13V8H11M15,1H9V3H15V1Z",clock:"M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z",pencil:"M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z",palette:"M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z",eye:"M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z",minus:"M19,13H5V11H19V13Z",plus:"M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z",offline:"M2.28,3L1,4.27L2.47,5.74C2.04,6 1.61,6.29 1.2,6.6L3,9C3.53,8.6 4.08,8.25 4.66,7.93L6.89,10.16C6.15,10.5 5.44,10.91 4.8,11.4L6.6,13.8C7.38,13.22 8.26,12.77 9.2,12.47L11.75,15C10.5,15.07 9.34,15.5 8.4,16.2L12,21L14.46,17.73L17.74,21L19,19.72M12,3C9.85,3 7.8,3.38 5.9,4.07L8.29,6.47C9.5,6.16 10.72,6 12,6C15.38,6 18.5,7.11 21,9L22.8,6.6C19.79,4.34 16.06,3 12,3M12,9C11.62,9 11.25,9 10.88,9.05L14.07,12.25C15.29,12.53 16.43,13.07 17.4,13.8L19.2,11.4C17.2,9.89 14.7,9 12,9Z",dotsVertical:"M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z",wifi:"M12,21L15.6,16.2C14.6,15.45 13.35,15 12,15C10.65,15 9.4,15.45 8.4,16.2L12,21M12,3C7.95,3 4.21,4.34 1.2,6.6L3,9C5.5,7.12 8.62,6 12,6C15.38,6 18.5,7.12 21,9L22.8,6.6C19.79,4.34 16.05,3 12,3M12,9C9.3,9 6.81,9.89 4.8,11.4L6.6,13.8C8.1,12.67 9.97,12 12,12C14.03,12 15.9,12.67 17.4,13.8L19.2,11.4C17.19,9.89 14.7,9 12,9Z",ethernet:"M7,15H9V18H11V15H13V18H15V15H17V18H18V9H15V6H9V9H6V18H7V15M4.38,3H19.63C20.94,3 22,4.06 22,5.38V19.63A2.37,2.37 0 0,1 19.63,22H4.38C3.06,22 2,20.94 2,19.63V5.38C2,4.06 3.06,3 4.38,3Z",shieldCheck:"M10,17L6,13L7.41,11.59L10,14.17L16.59,7.58L18,9M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z",shieldAlert:"M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M11,7H13V13H11V7M11,15H13V17H11V15Z",download:"M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z",memory:"M17,17H7V7H17M21,11V9H19V7C19,5.89 18.1,5 17,5H15V3H13V5H11V3H9V5H7C5.89,5 5,5.89 5,7V9H3V11H5V13H3V15H5V17A2,2 0 0,0 7,19H9V21H11V19H13V21H15V19H17A2,2 0 0,0 19,17V15H21V13H19V11M13,13H11V11H13M15,9H9V15H15V9Z",copy:"M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z",refresh:"M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z",infoOutline:"M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z",openInNew:"M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z"},b=t=>cn`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d=${ss[t]}></path></svg>`,Ui=()=>cn`<svg class="drawing" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
  <rect class="d-body" x="14" y="10" width="92" height="100" rx="10"></rect>
  <rect class="d-window" x="24" y="20" width="72" height="66" rx="5"></rect>
  <line class="d-line" x1="28" y1="36" x2="92" y2="36"></line>
  <path class="d-head" d="M52 31h16v11h-4l-4 5-4-5h-4z"></path>
  <rect class="d-part" x="50" y="64" width="20" height="12" rx="2"></rect>
  <line class="d-line" x1="32" y1="77" x2="88" y2="77"></line>
  <rect class="d-base" x="24" y="92" width="72" height="8" rx="3"></rect>
</svg>`;var ht=(t,e,n)=>({title:s(t,"stop_title"),text:s(t,"stop_text"),confirm:s(t,"stop_confirm"),keep:s(t,"stop_keep"),danger:!0,action:e,key:n});function $(t){let{label:e,iconName:n,onClick:i,kind:r="tonal",disabled:o=!1,pending:a=!1,iconOnly:d=!1,aria:l,className:p="",describedBy:h,answer:f}=t;return c`<button
    class="btn ${r} ${d?"icon-only":""} ${a?"pending":""} ${p}"
    ?disabled=${o}
    aria-disabled=${a?"true":u}
    aria-busy=${a?"true":"false"}
    aria-label=${l??e}
    aria-describedby=${h??u}
    data-answer=${f??u}
    title=${l??e}
    @click=${a?u:i}
  >
    ${b(n)}${d?u:c`<span>${e}</span>`}
  </button>`}function J(t){let e=[...t.currentTarget.querySelectorAll("[role=radio]")],n=e.indexOf(t.target),i={ArrowRight:n+1,ArrowDown:n+1,ArrowLeft:n-1,ArrowUp:n-1,Home:0,End:e.length-1};if(n<0||!(t.key in i))return;t.preventDefault();let r=e[(i[t.key]+e.length)%e.length];for(let o of e)o.tabIndex=o===r?0:-1;r?.focus()}function I(t){let e=t.currentTarget;if(t.relatedTarget instanceof Node&&e.contains(t.relatedTarget))return;let n=[...e.querySelectorAll("[role=radio]")],i=n.filter(a=>!a.disabled),r=a=>a.getAttribute("aria-checked")==="true",o=i.find(r)??i[0]??n.find(r)??n[0];for(let a of n)a.tabIndex=a===o?0:-1}var Q=(t,e)=>Math.max(0,t.indexOf(e));function Wi(t,e){if(!t.unreachable)return s(t.hass,e);let n=t.hass.user?.is_admin===!1;return t.missing?s(t.hass,n?"missing_text_user":"missing_text"):s(t.hass,n?"unreachable_text_user":"unreachable_text")}var ee=t=>t.missing?"missing_short":"unreachable_short",$e=t=>t.online?"online":t.unreachable?ee(t):"offline",je=t=>({...t,online:!0,unreachable:!1,missing:!1}),ft=(t,e=!1)=>e||t.online?"sample_job":t.unreachable?"sample_unreachable":"sample_offline";function mt(t,e,n){return c`<div class="sample">
    <span class="sample-note">${b("info")}<span>${s(t.hass,e)}</span></span>
    <div class="sample-body" inert>${n}</div>
  </div>`}function E(t,e="info"){return c`<div class="note ${e}">${b(e==="info"?"info":"warning")}<span>${t}</span></div>`}function Se(t,e=u){return c`<div class="callout">${b("info")}<span>${t}</span>${e}</div>`}var D=(t,e="info",n)=>c`<p class="dlg-note ${e}" id=${n??u}>${b(e)}<span>${t}</span></p>`,gt=(t,e)=>c`<div class=${t}><div class="sent" role="status">${b("check")}<span>${e}</span></div></div>`;function _t(t){return $({label:s(t.hass,"resume"),iconName:"play",kind:"primary",disabled:t.changing,pending:t.isPending("resume"),onClick:()=>t.run("resume","button","press",{entity_id:t.refs.resume})})}function bt(t){let{hass:e,refs:n}=t,i=n.dual?["nozzle_left","nozzle_right"]:["nozzle"];return[...n.nozzles.map((r,o)=>({label:s(e,i[o]),heater:r,kind:"nozzle",index:o})),{label:s(e,"bed"),heater:n.bed,kind:"bed",index:0},{label:s(e,"chamber"),heater:n.chamber,kind:"chamber",index:0}]}function wt(t){let{lower:e,raise:n,value:i,labelledBy:r,centered:o}=t;return c`<div class="stepper${o?" centered":""}" role=${r?"group":u} aria-labelledby=${r??u}>
    ${$({...e,iconName:"minus",iconOnly:!0})}
    <output class="step-value" aria-live="polite">${i}</output>
    ${$({...n,iconName:"plus",iconOnly:!0})}
  </div>`}function Ue(t){return t.refs.nozzles.flatMap(({sensor:e},n)=>{let i=S(t.hass,e);return e&&i!==void 0?[{sensor:e,value:i,index:n}]:[]}).sort((e,n)=>n.value-e.value)[0]}function ue(t){let{hass:e,refs:n}=t;return!t.canControl||!t.online||v(e,n.developerMode)?.state!=="off"?u:E(s(e,"developer_off"),"warning")}function vt(t,e,n){let i=t.hass.entities[e]?.name;if(!i||Object.values(_e).some(a=>a[n]===i))return s(t.hass,n);let r=`${t.refs.name} `;return(i.startsWith(r)?i.slice(r.length).trim():"")||i}var _n=["left","right"],Ce=(t,e)=>s(t,e===0?"left":"right"),pe="AMS HT",he=(t,e)=>c`${t===void 0?u:c`<span aria-hidden="true">${t}</span>`}<span class="sr-only">${e}</span>`;function yt(t,e){if(!e.model||e.name===e.model)return;let n=new Set(t.filter(i=>i.model&&i.model!==pe).map(i=>i.model));return!e.name.includes(e.model)||n.size>1&&e.model!==pe?e.model:void 0}function xt(t,e){let n=v(t,e.slots[0])?.attributes.nozzle;return n==="left"||n==="right"?n:void 0}function fe(t){let e=_n.indexOf(v(t.hass,t.refs.activeNozzle)?.state??"");return t.refs.dual&&e>=0?e:void 0}var as=new Set(["idle","assist","unknown","unavailable",""]);function kt(t){let{hass:e,refs:n}=t,i=v(e,n.amsStatus)?.state;if(!(!t.online||i===void 0||as.has(i)))return s(e,"ams_activity",{state:M(e,n.amsStatus)})}function ls(t){if(typeof t!="object"||t===null)return;let e=t;if(typeof e.id!="number"||typeof e.name!="string")return;let n=o=>typeof o=="string"&&o?o:void 0,i=e.remaining_g,r=e.remaining_pct;return{id:e.id,name:e.name,...n(e.color_name)?{colorName:n(e.color_name)}:{},...n(e.rgba)?{rgba:n(e.rgba)}:{},extraColors:Array.isArray(e.extra_colors)?e.extra_colors.filter(o=>typeof o=="string"):[],remainingG:typeof i=="number"?i:0,...typeof r=="number"?{remainingPct:r}:{},...n(e.storage_location)?{storage:n(e.storage_location)}:{},rfid:e.rfid===!0,alsoAssigned:hn(e.also_assigned),assignedColor:n(e.assigned_color)??"",assignedType:n(e.assigned_type)??"",spoolTypes:Array.isArray(e.spool_types)?e.spool_types.filter(o=>typeof o=="string"):[]}}function ds(t){let e=t.rgba&&/^[0-9a-f]{6}/i.test(t.rgba)?[`#${t.rgba.slice(0,6).toUpperCase()}`]:[],n=t.extraColors.filter(i=>/^[0-9a-f]{6}$/i.test(i)).map(i=>`#${i.toUpperCase()}`);return[...e,...n]}function bn(t){let e=ds(t),n=100/Math.max(1,e.length),i=e.length>1?`conic-gradient(${e.map((o,a)=>`${o} ${a*n}% ${(a+1)*n}%`).join(", ")})`:e[0]??"var(--bb-muted)",r=e.some(o=>Ke(o));return c`<span class="spool-dot ${r?"outline":""}" style="--dot: ${i}" data-colors=${e.length} aria-hidden="true"></span>`}function wn(t,e){let n=`${T(t,e.remainingG)}\xA0g`;return[e.colorName??"",e.remainingPct===void 0?n:`${n} (${z(t,e.remainingPct)})`,s(t,"inv_no",{id:e.id})].filter(Boolean).join(" \xB7 ")}function vn(t,e){let n=`${T(t,e.remainingG)}\xA0g`;return e.remainingPct===void 0?n:`${z(t,e.remainingPct)}\xA0\xB7\xA0${n}`}function cs(t,e,n){let i=v(t,e)?.attributes.slot;return typeof i=="number"&&Number.isInteger(i)&&i>0?i:n+1}var $t=(t,e,n,i)=>s(t,"slot_label",{slot:cs(t,n,i),unit:e.name});function L(t,e){let n=v(t,e),i=!R(t,e),r=i?{}:n.attributes,o=p=>typeof p=="string"?p:"",a=r.remaining,d=!i&&(r.empty===!0||n?.state==="empty"),l=ls(r.inventory_spool);return{entityId:e,name:d||i?"":o(r.name)||(n?.state??""),type:o(r.type),color:ji(r.color),...typeof a=="number"&&a>=0?{remaining:a}:{},active:r.active===!0,empty:d,unknown:i,rfid:r.rfid===!0,present:r.present===!0,...l?{inventory:l}:{},assignable:r.inventory_assignable===!0}}function We(t,e="small"){let n=t.color??"var(--bb-muted)",i=t.inventory?.remainingPct??t.remaining??100,r=t.color!==void 0&&Ke(t.color),o=!t.empty&&i<100;return c`<span
    class="swatch ${e} ${t.empty?"empty":""} ${t.unknown?"unknown":""} ${t.active?"active":""} ${r?"outline":""} ${o?"partial":""}"
    style="--c: ${n}; --fill: ${Math.max(6,Math.min(100,i))}%"
    aria-hidden="true"
    ><span class="fill"></span
  ></span>`}var ut=(t,e)=>s(t,e.present?"not_set":"empty");function St(t,e){if(e.unknown)return s(t,"unknown");let n=e.inventory;if(n)return e.empty?s(t,"inv_strip_waiting",{empty:ut(t,e),name:n.name}):`${n.name} \xB7 ${vn(t,n)}`;if(e.empty)return ut(t,e);let i=e.remaining===void 0?"":` \xB7 ${z(t,e.remaining)}`;return`${e.name||e.type}${i}`}function Ct(t){let{hass:e,refs:n}=t;return t.settings.externalSpool||t.ams.length===0?n.externalSpools:n.externalSpools.filter(i=>L(e,i).active||t.jobSpools?.has(i)===!0)}function ps(t,e){return e==="ai_monitoring"&&/^X1/i.test(t.refs.model)?s(t.hass,"detection_ai_monitoring_x1"):void 0}function us(t,e,n){let{hass:i}=t,r=vt(t,n,`detection_${e}`),o=ps(t,e),a=`det-sub-${e}`,d=c`<span class="det-text">
    <span class="det-name">${r}</span>
    ${o?c`<span class="det-sub" id=${a}>${o}</span>`:u}
  </span>`;if(!R(i,n))return c`<div class="det-row unknown">${d}<span class="det-state">${s(i,"unknown")}</span></div>`;let l=t.switchOn(n);if(t.viewOnly)return c`<div class="det-row">${d}<span class="det-state">${s(i,l?"on":"off")}</span></div>`;let p=t.isPending(`switch_${n}`);return c`<div class="det-row">
    ${d}
    <button
      class="det-switch"
      role="switch"
      aria-label=${r}
      aria-describedby=${o?a:u}
      aria-checked=${l?"true":"false"}
      aria-busy=${p?"true":"false"}
      aria-disabled=${p?"true":u}
      ?disabled=${!t.online}
      @click=${()=>t.toggleSwitch(n)}
    >
      <span class="toggle" aria-hidden="true"><span class="knob"></span></span>
    </button>
  </div>`}var hs=new Set(["ai_monitoring","spaghetti_detection","pileup_detection","clumping_detection","air_printing_detection"]);function Zi(t){let{hass:e,refs:n}=t;if(!n.detectors.length)return u;let i=n.detectors.filter(({entityId:d})=>R(e,d)),r=i.filter(({entityId:d})=>!t.switchOn(d)).length,o=i.length===1?s(e,r?"off":"on"):r===0?s(e,"detection_all_on"):r===i.length?s(e,"detection_all_off"):s(e,"detection_off",{off:r}),a=t.optionsOpen;return c`<section class="detection">
    <button class="det-head" aria-expanded=${a?"true":"false"} aria-controls=${a?"det-body":u} @click=${()=>t.toggleOptions()}>
      <span class="section-label" id="det-title">${b("eye")}${s(e,"detection")}</span>
      ${i.length?c`<span class="det-summary">${o}</span>`:u}
      <span class="det-chevron ${a?"open":""}" aria-hidden="true">${b("chevronDown")}</span>
    </button>
    ${a?c`<div class="det-body" id="det-body" role="region" aria-labelledby="det-title">
          <div class="det-rows">${n.detectors.map(({key:d,entityId:l})=>us(t,d,l))}</div>
          <p class="hint">${s(e,n.detectors.some(({key:d})=>hs.has(d))?"detection_hint":"detection_hint_plain")}</p>
        </div>`:u}
  </section>`}var Te=5,xn={nozzle:220,bed:55,chamber:40},fs={nozzle:320,bed:140,chamber:65};function ms(t){let e=t.busy?fe(t):void 0;return bt(t).flatMap(({label:n,heater:i,kind:r,index:o})=>i.target?[{label:n,kind:r,target:i.target,active:r==="nozzle"&&o===e,...i.sensor?{sensor:i.sensor}:{}}]:[])}var gs=t=>Math.round(t/Te)*Te;function _s(t,e){if(t.refs.nozzles.length>1&&!e.active)return xn.nozzle;let n=v(t.hass,t.refs.activeFilament)?.attributes??{},i=n.nozzle_temp_min,r=n.nozzle_temp_max;return typeof i=="number"&&typeof r=="number"&&r>=i&&i>0?gs((i+r)/2):xn.nozzle}function qi(t,e,n){let{hass:i}=t,r=S(i,e.sensor);return c`<div class="heat-name ${n?"on":""}">
    <span class="heat-label"
      >${b(e.kind)}<span class="heat-title"
        ><span class="heat-text">${e.label}</span> ${e.active?c`<span class="heat-tag">${s(i,"nozzle_active")}</span>`:u}</span
      ></span
    >
    <span class="heat-now"
      >${r===void 0?"\u2014":s(i,"heat_now",{value:N(i,e.sensor,r)})}</span
    >
  </div>`}function Yi(t,e,n,i=!1){let{hass:r}=t,o=n===void 0||n<=ce(r,e.target),a=n===void 0?"\u2014":o?s(r,"heater_off"):N(r,e.target,n),d=c`<span class="sr-only">${s(r,"heat_target_said",{what:e.label})} </span>`;return i?c`<output class="heat-target ${o?"off":""}" aria-live="polite">${d}${a}</output>`:c`<span class="heat-target ${o?"off":""}">${d}${a}</span>`}function bs(t,e){let n=S(t.hass,e.target),i=n!==void 0&&n>ce(t.hass,e.target);return c`<div class="heat-row view">${qi(t,e,i)} ${Yi(t,e,n)}</div>`}function ws(t,e,n){let{hass:i}=t,r=t.targetOf(e.target),o=V(i,e.target),a=ce(i,e.target),d=v(i,e.target)?.attributes.max,l=typeof d=="number"?d:G(fs[e.kind],o),p=r===void 0||r<=a,h=Math.min(l,G(e.kind==="nozzle"?_s(t,e):xn[e.kind],o)),f=p?h:Math.min(l,r+Te),g=p?a:Math.max(a,r-Te),_=e.label;return c`<div class="heat-row">
    ${qi(t,e,!p)}
    <div class="heat-set">
      ${$({label:s(i,"heat_lower",{what:_,step:Te,unit:o}),iconName:"minus",iconOnly:!0,disabled:n.disabled||p||n.locked,onClick:()=>t.stepTarget(e.target,g)})}
      ${Yi(t,e,r,!0)}
      ${$({label:p?s(i,"heat_start",{what:_,value:H(i,h,o)}):s(i,"heat_raise",{what:_,step:Te,unit:o}),iconName:"plus",iconOnly:!0,disabled:n.disabled||n.locked||!p&&r>=l,onClick:()=>t.stepTarget(e.target,f)})}
    </div>
    ${Ji({label:p?s(i,"heat_start",{what:_,value:H(i,h,o)}):s(i,"heat_off",{what:_}),on:!p,tone:"heat",usable:n.offered&&(!n.locked||!p),disabled:n.disabled||!p&&t.changing,onClick:()=>t.setTargets([[e.target,p?h:a]])})}
  </div>`}function Ji(t){return t.usable?$({label:t.label,iconName:"power",iconOnly:!0,kind:"plain",className:`heat-off tone-${t.tone}${t.on?" on":""}`,disabled:t.disabled,onClick:t.onClick}):c`<span class="heat-off-space" aria-hidden="true"></span>`}var yn=60,Tt=10,Gi=["cooling","heating"],vs={exhaust:"vent_fans_exhaust","right_aux exhaust":"vent_fans_right_aux_exhaust",aux:"vent_fans_aux","aux exhaust":"vent_fans_aux_exhaust"},At=t=>t.refs.airduct!==void 0&&t.refs.chamber.target===void 0;function Xi(t){let e=v(t.hass,t.refs.ventilation)?.attributes.fans;return Array.isArray(e)?e.filter(n=>typeof n=="string"):[]}function Qi(t){let{hass:e,refs:n}=t;if(At(t)&&v(e,n.airduct)?.state==="heating")return{kind:"warm"};let i=v(e,n.ventilation),r=i?.attributes.percentage;return i?.state==="on"&&typeof r=="number"&&r>0?{kind:"vent",percent:r}:void 0}function ys(t){let{hass:e,refs:n}=t,i=v(e,n.airduct)?.state,r=At(t);if(t.busy)return i==="cooling"?{...r?{}:{chamber:"chamber_cooling_print"},hint:Xi(t).length>1?"vent_print_cooling_two":"vent_print_cooling"}:i==="heating"?{vent:"vent_heating_print"}:i==="laser"?{vent:"airduct_laser_now"}:{};if(t.changing)return{...i==="cooling"&&!r?{chamber:"changing_reason"}:{},...i!=="cooling"?{vent:"changing_reason"}:{}};let o=n.chamber.target,a=r?i==="heating":o!==void 0&&Math.max(t.targetOf(o)??0,S(e,o)??0)>ce(e,o),d=n.ventilation,l=d!==void 0&&v(e,d)?.state==="on",p=i==="cooling"&&d!==void 0&&((t.targetOf(d)??0)>0||l);return{...a?{vent:r?"vent_keep_warm":"vent_chamber_heats"}:{},...p?{chamber:r?"keep_warm_vent_on":"chamber_vent_on"}:{},...i==="laser"&&!a?{hint:"airduct_laser_idle"}:{}}}function xs(t,e){let{hass:n,refs:i}=t,r=v(n,i.airduct);if(!r||!At(t))return u;let o=r.state==="heating",a=s(n,"chamber"),d=c`<div class="heat-name ${o?"on":""}">
    <span class="heat-label">${b("chamber")}<span class="heat-title"><span class="heat-text">${a}</span></span></span>
    <span class="heat-now">${s(n,"keep_warm")}</span>
  </div>`;if(t.viewOnly)return c`<div class="heat-row view keep-warm">${d}<span class="heat-target ${o?"":"off"}">${s(n,o?"on":"heater_off")}</span></div>`;let l=xe(r,Gi,!1).filter(y=>Gi.includes(y)),p=!t.online||t.busy||t.changing||r.state==="unavailable",h=y=>p||e.chamber!==void 0&&y==="heating",f=Q(l,r.state),g=h(l[f]??"")?Math.max(0,l.findIndex(y=>!h(y))):f,_=t.isPending("airduct"),m=`${a}, ${s(n,"keep_warm")}`;return c`<div class="heat-row keep-warm">
    ${d}
    <div class="seg" role="radiogroup" aria-label=${m} @keydown=${J} @focusout=${I}>
      ${l.map((y,w)=>c`<button
          role="radio"
          aria-checked=${y===r.state?"true":"false"}
          tabindex=${w===g?0:-1}
          aria-disabled=${_?"true":u}
          ?disabled=${h(y)}
          @click=${()=>t.run("airduct","select","select_option",{entity_id:i.airduct,option:y})}
        >
          ${s(n,y==="heating"?"on":"heater_off")}
        </button>`)}
    </div>
    <span class="heat-off-space" aria-hidden="true"></span>
  </div>`}function ks(t,e){if(t.viewOnly)return u;if(At(t)&&v(t.hass,t.refs.airduct)){let n=t.busy?"airduct_busy":t.changing?"changing_reason":e.chamber;return n?E(s(t.hass,n)):u}return e.chamber&&t.refs.chamber.target?E(s(t.hass,e.chamber)):u}function $s(t,e){let{hass:n,refs:i}=t,r=i.ventilation;if(!r)return u;let o=v(n,r),a=o!==void 0&&o.state!=="unavailable"&&o.state!=="unknown",d=a?t.targetOf(r):void 0,l=(d??0)>0,p=vs[Xi(t).join(" ")],h=s(n,"chamber"),f=d===void 0?"\u2014":l?z(n,d):s(n,"heater_off"),g=c`<div class="heat-name vent ${l?"on":""}">
    <span class="heat-label">${b("fan")}<span class="heat-title"><span class="heat-text">${h}</span></span></span>
    <span class="heat-now">${p?s(n,p):u}</span>
  </div>`,_=c`<span class="sr-only">${s(n,"vent_said")} </span>`,m=c`<div class="heat-head vent-head">
    <span class="section-label" id="vent-title">${b("fan")}${s(n,"ventilation")}</span>
  </div>`;if(t.viewOnly)return c`<div class="vent-part" role="group" aria-labelledby="vent-title">
      ${m}
      <div class="heat-rows"><div class="heat-row view">${g}<span class="heat-target ${l?"":"off"}">${_}${f}</span></div></div>
    </div>`;let y=e.vent!==void 0,w=!t.online||!a,k=d??0,x=z(n,yn),P=a?e.vent??e.hint:void 0;return c`<div class="vent-part" role="group" aria-labelledby="vent-title">
    ${m}
    <div class="heat-rows">
      <div class="heat-row">
        ${g}
        <div class="heat-set">
          ${$({label:s(n,"vent_lower",{step:Tt}),iconName:"minus",iconOnly:!0,disabled:w||y||!l,onClick:()=>t.stepTarget(r,Math.max(0,k-Tt))})}
          <output class="heat-target ${l?"":"off"}" aria-live="polite">${_}${f}</output>
          ${$({label:l?s(n,"vent_raise",{step:Tt}):s(n,"vent_start",{value:x}),iconName:"plus",iconOnly:!0,disabled:w||y||k>=100,onClick:()=>t.stepTarget(r,l?Math.min(100,k+Tt):yn)})}
        </div>
        ${Ji({label:l?s(n,"vent_off"):s(n,"vent_start",{value:x}),on:l,tone:"vent",usable:!y||l,disabled:w,onClick:()=>t.setTargets([[r,l?0:yn]])})}
      </div>
    </div>
    ${P?E(s(n,P)):u}
  </div>`}function er(t){let{hass:e,refs:n}=t,i=ms(t);if(!i.length)return u;let r=!t.online,o=!t.busy&&!t.viewOnly,a=p=>o||p.kind==="chamber"&&!t.viewOnly,d=n.airduct!==void 0||n.ventilation!==void 0,l=d?ys(t):{};return c`<section class="heating" aria-labelledby="heat-title">
    <div class="heat-head">
      <span class="section-label" id="heat-title">${b("heat")}${s(e,"heating")}</span>
    </div>
    <div class="heat-rows">
      ${i.map(p=>t.viewOnly?bs(t,p):ws(t,p,{disabled:r,offered:a(p),locked:p.kind==="chamber"&&l.chamber!==void 0}))}${xs(t,l)}
    </div>
    ${ks(t,l)}${$s(t,l)}${d?c`<p class="hint">${s(e,"heat_vent_hint")}</p>`:u}
  </section>`}var Ss=[1,10,50],kn=10,Cs=170,Ts=/^A(1|2L)\b/i,As=["cold_nozzle_left","cold_nozzle_right"],zs=["cold_nozzle_left_plain","cold_nozzle_right_plain"];function Ds(t,e){let{hass:n,refs:i}=t,r=v(n,i.activeNozzle);if(!r)return u;let o=xe(r,_n,!1),a=t.isPending("active_nozzle"),d=Q(o,r.state);return c`<div class="nozzle-row">
    <span class="step-label">${s(n,"active_nozzle")}</span>
    <div class="seg" role="radiogroup" aria-label=${s(n,"active_nozzle")} @keydown=${J} @focusout=${I}>
      ${o.map((l,p)=>c`<button
          role="radio"
          aria-checked=${l===r.state?"true":"false"}
          tabindex=${p===d?0:-1}
          aria-disabled=${a?"true":u}
          ?disabled=${e||r.state==="unavailable"}
          @click=${()=>t.run("active_nozzle","select","select_option",{entity_id:i.activeNozzle,option:l})}
        >
          ${M(n,i.activeNozzle,l)}
        </button>`)}
    </div>
  </div>`}function Ls(t){let e=fe(t);return e!==void 0?t.refs.nozzles[e].sensor:Ue(t)?.sensor}function Hs(t,e,n){let{hass:i,refs:r}=t,o=!t.online||t.busy||t.changing,a=r.deviceId,d=A=>`${A>0?"+":"\u2212"}${T(i,Math.abs(A),1)}`,l=(A,Po,No,Vo)=>{let di=Po*e,ci=`move_${A}`;return $({label:s(i,"move",{axis:A.toUpperCase(),distance:d(di)}),iconName:No,iconOnly:!0,disabled:o,pending:t.isPending(ci),className:`jog ${Vo}`,onClick:()=>t.run(ci,"bambuddy","move_axis",{device_id:a,axis:A,distance:di})})},p=Ts.test(r.model),h=A=>$({label:s(i,A>0?"bed_away":"bed_closer"),aria:p?s(i,A>0?"nozzle_away_aria":"nozzle_closer_aria",{step:T(i,e,1)}):s(i,A>0?"bed_away_aria":"bed_closer_aria",{step:T(i,e,1)}),iconName:A>0===p?"up":"down",disabled:o,pending:t.isPending("move_z"),className:"stack",onClick:()=>t.run("move_z","bambuddy","move_axis",{device_id:a,axis:"z",distance:A*e})}),f=Ls(t),g=S(i,f),_=V(i,f),m=G(Cs,_),y=g!==void 0&&g<m,w=fe(t),k=t.settings.sections.includes("heating"),x=w===void 0?k?"cold_nozzle":"cold_nozzle_plain":(k?As:zs)[w],P=A=>$({label:s(i,A>0?"extrude":"retract"),aria:s(i,A>0?"extrude_aria":"retract_aria",{length:kn}),iconName:A>0?"down":"up",disabled:o||y,pending:t.isPending("extrude"),className:"stack",onClick:()=>t.run("extrude","bambuddy","extrude",{device_id:a,distance:A*kn})}),Fo=$({label:s(i,"home"),aria:s(i,"home_aria"),iconName:"home",iconOnly:!0,kind:o?"tonal":"primary",disabled:o,pending:t.isPending("home"),className:"jog home",onClick:()=>t.confirm({title:s(i,"home_title"),text:s(i,"home_text"),confirm:s(i,"home"),action:["bambuddy","home_axes",{device_id:a}],key:"home"})});return c`${t.online&&t.busy?E(s(i,"busy_reason"),"warning"):t.changing?E(s(i,"changing_reason")):u}
    ${Ds(t,o)}
    <div class="control">
      <div class="step-row">
        <span class="step-label">${s(i,"step")}</span>
        <div class="seg" role="radiogroup" aria-label=${s(i,"step")} aria-disabled=${o?"true":"false"} @keydown=${J} @focusout=${I}>
          ${Ss.map(A=>c`<button
              role="radio"
              aria-checked=${A===e?"true":"false"}
              tabindex=${A===e?0:-1}
              ?disabled=${o}
              @click=${()=>n(A)}
            >
              ${T(i,A,1)} mm
            </button>`)}
        </div>
        ${t.startLive?$({label:s(i,"live"),iconName:"video",iconOnly:!0,className:"live-btn",onClick:t.startLive}):u}
      </div>
      <div class="pad">
        ${l("y",1,"up","n")}${l("x",-1,"left","w")}${Fo}${l("x",1,"right","e")}${l("y",-1,"down","s")}
      </div>
      <div class="axis-col bed">
        <span class="axis-label">${s(i,p?"nozzle_height":"bed_axis")}</span>
        ${p?c`${h(1)}${h(-1)}`:c`${h(-1)}${h(1)}`}
      </div>
      <div class="axis-col ext">
        <span class="axis-label">${s(i,"extruder")} · ${T(i,kn)} mm</span>
        <div class="ext-buttons">${P(-1)}${P(1)}</div>
      </div>
    </div>
    ${y&&!o?E(s(i,x,{temperature:H(i,m,_)})):u}
    <p class="hint">${s(i,"jog_note")}</p>`}function tr(t,e,n=!1){return e==="heating"?[...t.nozzles,t.bed,t.chamber].some(i=>i.target!==void 0):e==="motion"?!n:t.detectors.length>0}function $n(t,e,n){let i=r=>r==="heating"?er(t):r==="options"?Zi(t):t.viewOnly?u:Hs(t,e,n);return c`${ue(t)}${t.settings.sections.map(i)}`}var nr={ATTRIBUTE:1,CHILD:2,PROPERTY:3,BOOLEAN_ATTRIBUTE:4,EVENT:5,ELEMENT:6},Ae=t=>(...e)=>({_$litDirective$:t,values:e}),te=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,n,i){this._$Ct=e,this._$AM=n,this._$Ci=i}_$AS(e,n){return this.update(e,n)}update(e,n){return this.render(...n)}};var{I:Es}=Ai,ir=t=>t;var rr=()=>document.createComment(""),ze=(t,e,n)=>{let i=t._$AA.parentNode,r=e===void 0?t._$AB:e._$AA;if(n===void 0){let o=i.insertBefore(rr(),r),a=i.insertBefore(rr(),r);n=new Es(o,a,t,t.options)}else{let o=n._$AB.nextSibling,a=n._$AM,d=a!==t;if(d){let l;n._$AQ?.(t),n._$AM=t,n._$AP!==void 0&&(l=t._$AU)!==a._$AU&&n._$AP(l)}if(o!==r||d){let l=n._$AA;for(;l!==o;){let p=ir(l).nextSibling;ir(i).insertBefore(l,r),l=p}}}return n},ne=(t,e,n=t)=>(t._$AI(e,n),t),Rs={},zt=(t,e=Rs)=>t._$AH=e,or=t=>t._$AH,Dt=t=>{t._$AR(),t._$AA.remove()};var Sn=Ae(class extends te{constructor(){super(...arguments),this.key=u}render(t,e){return this.key=t,e}update(t,[e,n]){return e!==this.key&&(zt(t),this.key=e),n}});var Ms=["pass","fail","warn","skip"];async function ar(t,e){let n=await we(t,"run_diagnostic",{device_id:e}),i=de(n.checks,"id","string").map(r=>({id:r.id,status:Ms.includes(r.status)?r.status:"skip",params:typeof r.params=="object"&&r.params!==null?r.params:{}}));return{overall:typeof n.overall=="string"?n.overall:"ok",checks:i}}function Lt(t,e,n={}){return e in _e[be(t)]?s(t,e,n):void 0}var Cn=t=>Object.fromEntries(Object.entries(t.params).filter(e=>["string","number"].includes(typeof e[1]))),lr=(t,e)=>Lt(t,`check_${e.id}`,Cn(e))??e.id;function dr(t,e,n=!1){let i=typeof e.params.reason=="string"?e.params.reason:void 0;if(e.id==="developer_mode"&&e.status==="fail")return s(t,"developer_off");let r=i?`check_${e.id}_${e.status}_${i}`:void 0,o=r&&Lt(t,r)!==void 0?r:`check_${e.id}_${e.status}`,a=Lt(t,o,Cn(e)),d=n?Lt(t,`${o}_fix`,Cn(e)):void 0;return a?[a,d].filter(Boolean).join(" "):e.status==="skip"?s(t,"check_skip"):void 0}var Bs={pass:"check",fail:"error",warn:"warning",skip:"minus"},Os={pass:"ok",fail:"error",warn:"warning",skip:"skip"};function Fs(t,e,n){let{hass:i}=t,r=dr(i,e,!n),o=e.status==="fail"?"hms_error":e.status==="warn"?"hms_warning":void 0;return c`<div class="check-item hms-item sev-${Os[e.status]}">
    ${b(Bs[e.status])}
    <div class="hms-body">
      ${o?c`<span class="sr-only">${s(i,o)}: </span>`:u}<span class="check-title">${lr(i,e)}</span>
      ${r?c`<span class="check-detail">${r}</span>`:u}
      ${n?c`<span class="check-detail">${s(i,"check_follows")}</span>`:u}
    </div>
  </div>`}function Ps(t,e){let n=e.checks.filter(r=>r.status==="fail").length,i=e.checks.filter(r=>r.status==="warn").length;if(e.overall==="problems"||n>0){let r=Math.max(1,n);return{tone:"err",text:r===1?s(t,"check_problems_one"):s(t,"check_problems",{n:r})}}if(e.overall==="warnings"||i>0){let r=Math.max(1,i);return{tone:"warn",text:r===1?s(t,"check_warnings_one"):s(t,"check_warnings",{n:r})}}return{tone:"ok",text:s(t,"check_ok")}}function sr(t,e,n,i,r){let{hass:o}=t;if(!n.length)return u;let a=i.open?.includes(e)??!1,d=n.length,l=e==="pass"?d===1?s(o,"check_passed_one"):s(o,"check_passed",{n:d}):s(o,"check_skipped",{n:d});return c`<div class="check-fold ${e==="pass"?"tone-ok":"tone-neutral"}">
    <button class="det-head" aria-expanded=${a?"true":"false"} @click=${()=>r.toggleFold(e)}>
      <span class="section-label">${b(e==="pass"?"check":"minus")}${l}</span>
      <span class="det-chevron ${a?"open":""}" aria-hidden="true">${b("chevronDown")}</span>
    </button>
    ${a?c`<div class="check-folded">
          ${n.map(p=>c`<div class="check-line">
              <span class="check-title">${lr(o,p)}</span>
              ${e==="skip"?c`<span class="check-detail">${dr(o,p)}</span>`:u}
            </div>`)}
        </div>`:u}
  </div>`}function Ns(t,e,n){let{hass:i}=t;if(e.running){let o=Math.max(0,Math.floor((n-e.started)/1e3));return c`<div class="check-running">
        <span class="check-spinner" aria-hidden="true"></span>
        <span class="check-seconds" aria-hidden="true">${s(i,"check_running",{s:o})}</span>
        <span class="sr-only">${s(i,"check_running_sr")}</span>
      </div>
      <p class="hint">${s(i,"check_running_hint")}</p>`}if(e.error||!e.result)return c`<div class="dlg-error">${b("error")}<span>${s(i,"check_error",{error:e.error??""})}</span></div>`;let r=Ps(i,e.result);return c`<div class="check-verdict tone-${r.tone}">${b(r.tone==="ok"?"check":r.tone==="warn"?"warning":"error")}<span>${r.text}</span></div>`}function cr(t,e,n,i){let{hass:r}=t,o=!e.running&&e.result?e.result.checks:[],a=o.some(l=>l.id==="port_mqtt"&&l.status==="fail"),d=o.filter(l=>l.status==="fail"||l.status==="warn").sort((l,p)=>+(p.status==="fail")-+(l.status==="fail"));return c`<h2 id="dlg-title">${s(r,"check_connection")}</h2>
    <div class="check-status" role="status">${Ns(t,e,i)}</div>
    ${d.length?c`<div class="hms-list check-list">
          ${d.map(l=>Fs(t,l,a&&l.id!=="port_mqtt"&&l.id.startsWith("port_")))}
        </div>`:u}
    ${sr(t,"pass",o.filter(l=>l.status==="pass"),e,n)}
    ${sr(t,"skip",o.filter(l=>l.status==="skip"),e,n)}`}var Tn=["tap","always","off"],Ht=["controls","power","temperatures","ams","fans","speed"],An=["network","hms","firmware","maintenance","door","storage","drying","power"],pr=["network","hms","firmware"],Et=["heating","options","motion"],zn=["status","control","filament"],Dn=["auto","folded","open"],ur=["ai_monitoring","first_layer_inspection","build_plate_detection","build_plate_position_detection","spaghetti_detection","pileup_detection","clumping_detection","air_printing_detection"];var Rt="bambuddy",Ln=t=>t.slice(0,t.indexOf(".")),hr=new WeakMap;function De(t){let e=hr.get(t.entities);if(e)return e;let n=new Map;for(let i of Object.values(t.entities)){if(!i||i.platform!==Rt||!i.device_id)continue;let r=n.get(i.device_id)??[];r.push(i),n.set(i.device_id,r)}return hr.set(t.entities,n),n}function Hn(t){let e=new Map;for(let n of t){if(!n.translation_key)continue;let i=`${Ln(n.entity_id)}.${n.translation_key}`;e.set(i,[...e.get(i)??[],n.entity_id])}return e}var Vs="sensor.print_status",Is="binary_sensor.bambuddy_online";function gr(t,e){return(De(t).get(e)??[]).find(n=>n.translation_key==="print_status"&&Ln(n.entity_id)==="sensor")?.entity_id}var Mt=(t,e)=>!!e&&gr(t,e)!==void 0;function _r(t,e){let n=gr(t,e);return n?t.states[n]?.state:void 0}var Ks=/^[^_]+_printer_[^_]+$/,br=t=>(t.identifiers??[]).some(([e,n])=>e===Rt&&Ks.test(n));function wr(t){return Object.values(t.devices).filter(e=>!!e&&Mt(t,e.id))}var Ze=t=>t.name_by_user||t.name||"";function fr(t){let e=t?t.lastIndexOf(" ("):-1;return e>0?t.slice(0,e):void 0}function vr(t,e){let n=Ze(t);if(t.name_by_user)return n;let i=[e.name,e.name_by_user,fr(e.name)].find(o=>o&&n.startsWith(`${o} `)),r=i?n.slice(i.length+1):n;return r.endsWith(")")?fr(r)??r:r}function yr(t,e,n){let i=t.states[e]?.attributes[n];return typeof i=="number"?i:void 0}function js(t,e){let n=i=>yr(t,i,"slot")??Number.MAX_SAFE_INTEGER;return[...e].sort((i,r)=>n(i)-n(r))}function mr(t,e){let n=e.slots.map(i=>yr(t,i,"tray_id")).filter(i=>i!==void 0);return n.length?Math.min(...n):Number.MAX_SAFE_INTEGER}function Us(t,e){let n=De(t),i=[];for(let r of Object.values(t.devices)){if(!r||r.via_device_id!==e.id)continue;let o=Hn(n.get(r.id)??[]),a=o.get("sensor.ams_slot");if(!a)continue;let d=l=>o.get(l)?.[0];i.push({deviceId:r.id,name:vr(r,e),model:r.model??"",humidity:d("sensor.ams_humidity"),temperature:d("sensor.ams_temperature"),slots:js(t,a),drying:d("binary_sensor.drying"),dryingRemaining:d("sensor.drying_remaining_time")})}return i.sort((r,o)=>mr(t,r)-mr(t,o)||r.name.localeCompare(o.name))}function X(t,e,n){let i=e.power??e.run;return i?t.states[i]?.attributes[n]:void 0}function Ws(t,e){let n=De(t),i=[];for(let r of Object.values(t.devices)){if(!r||r.via_device_id!==e.id)continue;let o=Hn(n.get(r.id)??[]),a=h=>o.get(h)?.[0],d=a("switch.plug"),l=d??a("binary_sensor.plug"),p=a("button.plug_run");!l&&!p||i.push({deviceId:r.id,name:vr(r,e),...l?{power:l}:{},switchable:d!==void 0,...p?{run:p}:{},...a("sensor.plug_power")?{watts:a("sensor.plug_power")}:{},...a("sensor.plug_energy_today")?{energyToday:a("sensor.plug_energy_today")}:{},...a("switch.auto_off")?{autoOff:a("switch.auto_off")}:{},...a("switch.auto_off_every_print")?{autoOffEveryPrint:a("switch.auto_off_every_print")}:{},...a("number.auto_off_temperature")?{autoOffTemperature:a("number.auto_off_temperature")}:{},...a("button.auto_off_skip")?{autoOffSkip:a("button.auto_off_skip")}:{}})}return i.sort((r,o)=>r.name.localeCompare(o.name))}var Zs={"fan.part_cooling_fan":"part","fan.auxiliary_fan":"aux","fan.chamber_fan":"chamber","fan.exhaust_fan":"exhaust","fan.left_auxiliary_fan":"left_aux","fan.right_auxiliary_fan":"right_aux"},Gs=[...["left_","right_"].flatMap(t=>[`sensor.${t}nozzle_temperature`,`number.${t}nozzle_target_temperature`,`sensor.${t}external_spool`]),"select.active_nozzle"];function xr(t,e){let n=e?t.devices[e]:void 0;if(!n)return;let i=De(t).get(n.id)??[],r=Hn(i),o=x=>r.get(x)?.[0],a=o(Vs);if(!a)return;let d=Gs.some(x=>r.has(x)),l=d?["left_","right_"]:[""],p=l.map(x=>({sensor:o(`sensor.${x}nozzle_temperature`),target:o(`number.${x}nozzle_target_temperature`)})),h=l.map(x=>o(`sensor.${x}external_spool`)),f=Object.entries(Zs).map(([x,P])=>({key:P,entityId:o(x)})).filter(x=>x.entityId!==void 0),g=ur.map(x=>({key:x,entityId:o(`switch.${x}`)})).filter(x=>x.entityId!==void 0),_=o("binary_sensor.online"),m=qs(t,n),y=Us(t,n),w=Ws(t,n),k=x=>l.map(P=>o(`sensor.${P}${x}`));return{deviceId:n.id,name:Ze(n),model:n.model??"",status:a,stage:o("sensor.print_stage"),progress:o("sensor.progress"),remaining:o("sensor.remaining_time"),endTime:o("sensor.end_time"),layer:o("sensor.current_layer"),totalLayers:o("sensor.total_layers"),job:o("sensor.current_print"),nozzles:p,dual:d,bed:{sensor:o("sensor.bed_temperature"),target:o("number.bed_target_temperature")},chamber:{sensor:o("sensor.chamber_temperature"),target:o("number.chamber_target_temperature")},hotendFan:o("sensor.hotend_fan"),hms:o("sensor.hms_errors"),activeFilament:o("sensor.active_filament"),externalSpools:h.filter(x=>x!==void 0),online:_,plateClearNeeded:o("binary_sensor.plate_clear_needed"),developerMode:o("binary_sensor.developer_mode"),amsStatus:o("sensor.ams_status"),activeNozzle:o("select.active_nozzle"),pause:o("button.pause"),resume:o("button.resume"),stop:o("button.stop"),plateCleared:o("button.plate_cleared"),clearHms:o("button.clear_hms_errors"),speed:o("select.print_speed"),fans:f,detectors:g,light:o("light.chamber_light")??o("light.light"),plainLight:!o("light.chamber_light")&&o("light.light")!==void 0,camera:o("camera.camera"),cameraFps:o("number.camera_frame_rate"),cover:o("image.cover"),refresh:o("button.refresh_status"),printHours:o("sensor.print_hours"),wifiSignal:o("sensor.wifi_signal"),wiredNetwork:o("binary_sensor.wired_network"),ipAddress:o("sensor.ip_address"),firmware:o("update.firmware"),door:o("binary_sensor.door"),storage:o("binary_sensor.sd_card")??o("binary_sensor.usb_drive"),storageUsb:!r.has("binary_sensor.sd_card")&&r.has("binary_sensor.usb_drive"),maintenance:o("sensor.maintenance"),airduct:o("select.airduct_mode"),ventilation:o("fan.ventilation"),filamentBackup:o("switch.ams_filament_backup"),nozzleDiameters:k("nozzle_diameter"),nozzleTypes:k("nozzle_type"),ams:y,plugs:w,server:m,watched:[...i.map(x=>x.entity_id),...m?[m]:[],...[...y,...w].flatMap(x=>(De(t).get(x.deviceId)??[]).map(P=>P.entity_id))]}}function kr(t){let e=[...t.nozzles,t.bed,t.chamber].map(i=>i.target);return[t.pause,t.resume,t.stop,t.plateCleared,t.clearHms,t.light,t.speed,t.activeNozzle,t.airduct,t.ventilation,t.filamentBackup,...e].some(i=>i!==void 0)||t.fans.length>0||t.detectors.length>0}function qs(t,e){let n=e.via_device_id;if(n)return(De(t).get(n)??[]).find(i=>`${Ln(i.entity_id)}.${i.translation_key}`===Is)?.entity_id}function $r(t,e){let n=e.server?t.states[e.server]?.attributes.missing_printers:void 0;return Array.isArray(n)&&n.includes(e.deviceId)}function Le(t,e){if(e.online)return t.states[e.online]?.state==="on";let n=e.status?t.states[e.status]?.state:void 0;return n!==void 0&&n!=="offline"&&n!=="unavailable"}function Sr(t,e){return Le(t,e)?e.ams.filter(n=>n.slots.some(i=>t.states[i]?.state!=="unavailable")):e.ams}var Cr=(t,e,n)=>{let i=new Map;for(let r=e;r<=n;r++)i.set(t[r],r);return i},Tr=Ae(class extends te{constructor(t){if(super(t),t.type!==nr.CHILD)throw Error("repeat() can only be used in text expressions")}dt(t,e,n){let i;n===void 0?n=e:e!==void 0&&(i=e);let r=[],o=[],a=0;for(let d of t)r[a]=i?i(d,a):a,o[a]=n(d,a),a++;return{values:o,keys:r}}render(t,e,n){return this.dt(t,e,n).values}update(t,[e,n,i]){let r=or(t),{values:o,keys:a}=this.dt(e,n,i);if(!Array.isArray(r))return this.ut=a,o;let d=this.ut??=[],l=[],p,h,f=0,g=r.length-1,_=0,m=o.length-1;for(;f<=g&&_<=m;)if(r[f]===null)f++;else if(r[g]===null)g--;else if(d[f]===a[_])l[_]=ne(r[f],o[_]),f++,_++;else if(d[g]===a[m])l[m]=ne(r[g],o[m]),g--,m--;else if(d[f]===a[m])l[m]=ne(r[f],o[m]),ze(t,l[m+1],r[f]),f++,m--;else if(d[g]===a[_])l[_]=ne(r[g],o[_]),ze(t,r[f],r[g]),g--,_++;else if(p===void 0&&(p=Cr(a,_,m),h=Cr(d,f,g)),p.has(d[f]))if(p.has(d[g])){let y=h.get(a[_]),w=y!==void 0?r[y]:null;if(w===null){let k=ze(t,r[f]);ne(k,o[_]),l[_]=k}else l[_]=ne(w,o[_]),ze(t,r[f],w),r[y]=null;_++}else Dt(r[g]),g--;else Dt(r[f]),f++;for(;_<=m;){let y=ze(t,l[m+1]);ne(y,o[_]),l[_++]=y}for(;f<=g;){let y=r[f++];y!==null&&Dt(y)}return this.ut=a,zt(t,l),Z}});var Ar={"Clean Build Plate":"maint_task_clean_build_plate","Clean Nozzle/Hotend":"maint_task_clean_nozzle","Check Belt Tension":"maint_task_belt_tension","Check PTFE Tube":"maint_task_ptfe_tube","Clean Carbon Rods":"maint_task_clean_carbon_rods","Lubricate Steel Rods":"maint_task_lubricate_steel_rods","Clean Steel Rods":"maint_task_clean_steel_rods","Lubricate Linear Rails":"maint_task_lubricate_rails","Clean Linear Rails":"maint_task_clean_rails"},zr=t=>typeof t=="number"&&Number.isFinite(t)?t:0;function Ys(t){if(typeof t!="object"||t===null)return;let e=t;if(typeof e.id!="number")return;let n=e.due===!0;return{id:e.id,name:typeof e.name=="string"?e.name:"",due:n,dueSoon:!n&&e.due_soon===!0,unit:e.unit==="days"?"days":"hours",interval:zr(e.interval),left:zr(e.left),done:typeof e.last_done=="string"}}function Bt(t){let e=v(t.hass,t.refs.maintenance);if(!e||t.unreachable||!R(t.hass,t.refs.maintenance))return;let n=e.attributes.tasks,i=(Array.isArray(n)?n:[]).map(Ys).filter(r=>r!==void 0);return{state:e.state,tasks:i,due:i.filter(r=>r.due).length,soon:i.filter(r=>r.dueSoon).length}}var Js=t=>t.due?"err":t.dueSoon?"warn":"ok";function Dr(t,e){let{hass:n}=t,i=Bt(t);if(!i)return u;let{due:r,soon:o}=i,a=r+o,d=r>0?"err":o>0?"warn":"ok",l=a?s(n,r>0?"maint_due":"maint_due_soon",{n:a}):s(n,"maint_ok"),p=r>0?[s(n,"maint_part_overdue",{n:r}),...o>0?[s(n,"maint_part_soon",{n:o})]:[]]:[],h=a?p.length?s(n,"maint_due_aria",{shown:l,parts:p.join(", ")}):l:s(n,"maint_ok_aria"),f=t.settings.compactChips?he(a?String(a):s(n,"chip_ok"),h):c`<span>${l}</span>`;return c`<button class="pill maintenance tone-${d}" aria-label=${h} title=${h} aria-haspopup="dialog" @click=${e}>
    ${b("wrench")}${f}
  </button>`}function En(t,e,n){let{hass:i}=t,r=Math.abs(n);return e.unit==="days"?q(i,r*1440):r<24?q(i,r*60):s(i,"dur_h",{h:T(i,Math.round(r))})}function Xs(t,e){let{hass:n}=t;return e.done?e.due?s(n,"maint_overdue",{time:En(t,e,e.left)}):e.dueSoon?s(n,"maint_soon",{time:En(t,e,e.left)}):s(n,"maint_in",{time:En(t,e,e.left)}):s(n,"maint_never")}function Qs(t){let e=i=>i.due?0:i.dueSoon?1:2,n=i=>i.left*(i.unit==="days"?24:1);return[...t].sort((i,r)=>e(i)-e(r)||n(i)-n(r))}function ea(t,e,n,i,r){let{hass:o}=t,a=Object.hasOwn(Ar,e.name)?Ar[e.name]:void 0,d=a?s(o,a):e.name,l=e.interval>0?Math.min(1,Math.max(0,(e.interval-e.left)/e.interval)):1,p=n.marking?.includes(e.id)??!1,h=n.confirming===e.id;return c`<div class="maint-row tone-${Js(e)}">
    <div class="maint-text">
      <span class="maint-name">${d}</span>
      <span class="maint-when">${Xs(t,e)}</span>
      <span class="maint-bar" aria-hidden="true"><span style="width: ${Math.round(l*100)}%"></span></span>
    </div>
    ${r&&!h?c`<button
          class="btn ${e.due||e.dueSoon?"tonal":"plain"} maint-done ${p?"pending":""}"
          data-task=${e.id}
          aria-label=${s(o,"maint_done_aria",{task:d})}
          aria-busy=${p?"true":"false"}
          ?disabled=${p}
          @click=${()=>i.confirmTask(e.id)}
        >
          ${b("check")}<span>${s(o,"maint_done")}</span>
        </button>`:u}
    ${r&&h?c`<div class="maint-confirm" role="group" aria-label=${d} aria-describedby="maint-ask-${e.id}">
          <span id="maint-ask-${e.id}">${s(o,"maint_confirm")}</span>
          <span class="maint-confirm-actions">
            <button class="btn plain" @click=${()=>i.confirmTask(void 0)}>${s(o,"cancel")}</button>
            <button class="btn primary" @click=${()=>i.markDone(e.id,d)}>${s(o,"maint_done")}</button>
          </span>
        </div>`:u}
  </div>`}function Lr(t,e,n){let{hass:i,refs:r}=t,o=Bt(t),a=Qs(o?.tasks??[]),d=!t.settings.readOnly,l=v(i,r.printHours);return c`<h2 id="dlg-title">${s(i,"maint_title")}</h2>
    ${a.some(p=>!p.done)?D(s(i,d?"maint_all_never":"maint_all_never_hidden")):u}
    ${a.length?c`<div class="maint-list">${Tr(a,p=>p.id,p=>ea(t,p,e,n,d))}</div>`:t.unreachable?D(s(i,ee(t))):c`<p class="hms-empty">${s(i,"maint_none")}</p>`}
    ${e.error?c`<div class="dlg-error" role="alert">${b("error")}<span>${e.error}</span></div>`:u}
    <p class="maint-said sr-only" role="status">${e.marked?s(i,"maint_marked",{task:e.marked}):""}</p>
    <p class="maint-foot">
      ${l&&R(i,r.printHours)?c`<span>${s(i,"maint_hours",{hours:M(i,r.printHours,l.state)??l.state})}</span>`:u}
      <span>${s(i,"maint_note")}</span>
    </p>`}var ta=18e4,Pt=50,Ot=5,na=30,ia=100,Hr=50,Mn=(t,e)=>X(t.hass,e,"powers_printer")===!0,ra=(t,e)=>X(t.hass,e,"bambuddy_auto_off")===!0,oa=(t,e)=>X(t,e,"on_printer_card")!==!1,Mr=(t,e,n)=>e.some(r=>typeof X(t,r,"printer_main")=="boolean")?X(t,n,"printer_main")===!0:e.find(r=>X(t,r,"powers_printer")===!0)===n,Bn=(t,e)=>{let n=r=>Mr(t,e,r),i=r=>Number(r.power!==void 0&&n(r));return e.filter(r=>n(r)||oa(t,r)).sort((r,o)=>i(o)-i(r))},Ft=t=>Bn(t.hass,t.refs.plugs),qe=t=>Ft(t).find(e=>e.power&&Mr(t.hass,t.refs.plugs,e)),Ye=(t,e)=>v(t.hass,e.power??e.run)?.state??"unavailable",Ge=t=>!t.settings.readOnly,sa=["plug_off_hot_left","plug_off_hot_right"],Er={drying:"auto_off_waiting_drying",filament:"auto_off_waiting_filament",heating:"auto_off_waiting_heating",printer:"auto_off_waiting_printer",plug:"auto_off_waiting_plug"};function Nt(t,e){let n=v(t.hass,e.autoOff);if(!n)return;let i=n.attributes,r=S(t.hass,e.autoOffTemperature),o=r===void 0?"\xB0C":V(t.hass,e.autoOffTemperature),a=r??(typeof i.temperature=="number"?i.temperature:Pt);return{armed:n.state==="on",phase:typeof i.phase=="string"?i.phase:"idle",...typeof i.since=="string"?{since:i.since}:{},temperature:a,unit:o,every:i.every_print===!0,...typeof i.waiting_for=="string"?{waitingFor:i.waiting_for}:{},switching:i.switching===!0}}var Rr=(t,e)=>!!e&&Nt(t,e)?.phase==="waiting";function aa(t,e){let{hass:n,refs:i}=t,r=e.power,o=["switch","turn_off",{entity_id:r}],a=`plug_${r}`,d=s(n,"plug_off_confirm"),l=s(n,"plug_off_keep");if(!Mn(t,e))return{title:s(n,"plug_off_title",{plug:e.name}),text:s(n,"plug_off_text"),confirm:d,keep:l,action:o,key:a};if(t.online&&t.busy){let f=M(n,i.job),g=f?pt(f):void 0,_=S(n,i.progress);return{title:s(n,"plug_off_title_print"),text:g&&_!==void 0?s(n,"plug_off_text_print",{job:g,progress:z(n,_)}):s(n,"plug_off_text_print_plain"),note:s(n,"plug_off_print_note"),noteTone:"warning",confirm:d,keep:l,danger:!0,action:o,key:a}}if(!t.online){let f=S(n,e.watts);return{title:s(n,"plug_off_title_printer"),text:f===void 0?s(n,"plug_off_text_offline_plain"):s(n,f>Hr?"plug_off_text_offline":"plug_off_text_offline_idle",{power:ke(n,f)}),confirm:d,keep:l,danger:f===void 0||f>Hr,action:o,key:a}}let p=Ue(t),h=p!==void 0&&p.value>=G(Pt,V(n,p.sensor))?p:void 0;return{title:s(n,"plug_off_title_printer"),text:s(n,"plug_off_text_printer",{plug:e.name}),...h?{note:s(n,t.refs.nozzles.length>1?sa[h.index]:"plug_off_hot",{temperature:N(n,h.sensor,h.value)}),noteTone:"warning"}:{},confirm:d,keep:l,action:o,key:a}}function Rn(t,e,n){n?t.toggleSwitch(e.power):t.confirm(aa(t,e))}var Br=(t,e)=>t.isPending(`switch_${e}`)||t.isPending(`plug_${e}`);function Or(t,e,n,i){let r=t.switchOn(e),o=Br(t,e);return c`<button
    class="det-switch"
    role="switch"
    aria-label=${n}
    aria-checked=${r?"true":"false"}
    aria-busy=${o?"true":"false"}
    aria-disabled=${o?"true":u}
    @click=${o?u:i}
  >
    <span class="toggle" aria-hidden="true"><span class="knob"></span></span>
  </button>`}function la(t,e,n){let{hass:i}=t,r=S(i,e.watts),o=S(i,e.energyToday),a=[c`${s(i,n==="on"?"on":n==="off"?"off":"unknown")}`];return r!==void 0&&a.push(c`<b>${ke(i,r)}</b>`),o!==void 0&&a.push(c`${s(i,"plug_today",{energy:Vi(i,o)})}`),c`${a.map((d,l)=>l?c` · ${d}`:d)}`}function da(t,e,n){let{hass:i}=t,r=Ye(t,e),o=!e.power&&e.run!==void 0,a,d=u,l=u,p,h="";if(o){if(a=s(i,"plug_script"),Ge(t)&&r!=="unavailable"){let g=`run_${e.run}`;d=$({label:s(i,"plug_run"),aria:s(i,"plug_run_named",{plug:e.name}),iconName:"play",pending:t.isPending(g),onClick:()=>t.run(g,"button","press",{entity_id:e.run})})}}else if(r==="unavailable")a=s(i,t.unreachable?ee(t):"plug_unreachable"),h=t.unreachable?"":"warn";else if(r==="unknown"&&e.switchable){if(a=s(i,"plug_unknown"),Ge(t)){let g=Br(t,e.power);l=c`<div class="p-set" role="group" aria-label=${e.name}>
        ${[!1,!0].map(_=>$({label:s(i,_?"plug_turn_on":"plug_turn_off"),aria:s(i,_?"plug_turn_on_named":"plug_turn_off_named",{plug:e.name}),iconName:_?"power":"plugOff",pending:g,onClick:()=>Rn(t,e,_)}))}
      </div>`}}else a=la(t,e,r),e.switchable&&Ge(t)?d=Or(t,e.power,e.name,()=>Rn(t,e,!t.switchOn(e.power))):X(i,e,"plug_type")==="mqtt"&&(p=s(i,"plug_monitor"));let f=r==="on";return c`<div class="p-row ${h} ${o?"p-script":""}">
      <span class="p-icon ${f?"on":""}" aria-hidden="true">${b(o?"script":f||r==="unknown"?"plug":"plugOff")}</span>
      <span class="p-text">
        <span class="p-name">${e.name}${n?c` <span class="temp-tag">${s(i,"plug_printer_tag")}</span>`:u}</span>
        <span class="p-sub">${a}</span>
        ${p?c`<span class="p-sub">${p}</span>`:u}
      </span>
      ${d}
    </div>
    ${l}`}function ca(t,e){let{hass:n}=t;if(!t.settings.showAutoOff||!Mn(t,e))return u;let i=Nt(t,e),r=ra(t,e);if(!i&&!r)return u;if(Ye(t,e)==="unavailable"&&!i?.armed)return u;let o=H(n,i?.temperature??Pt,i?.unit),a=i?.phase==="waiting"&&!r,d=a?s(n,"auto_off_waiting_title"):s(n,"auto_off_title"),l;if(r)l=s(n,t.viewOnly||!i?"auto_off_bambuddy_view":"auto_off_bambuddy");else if(a){let _=Ue(t),m=i?.waitingFor;l=i?.switching?s(n,"auto_off_switching"):m&&m!=="nozzle"&&Er[m]?s(n,Er[m]):s(n,"auto_off_waiting",{temperature:o,now:_===void 0?"\u2014":N(n,_.sensor,_.value)})}else i?.phase==="failed_print"?l=s(n,i.every?"auto_off_failed":"auto_off_failed_next"):i?.phase==="gave_up"?l=s(n,"auto_off_gave_up"):i?.phase==="skipped"&&i.armed?l=s(n,"auto_off_skipped"):i?.armed?l=s(n,i.every?"auto_off_every":"auto_off_next",{temperature:o}):l=s(n,"auto_off_disarmed");let p=Ge(t)&&!r&&!!e.autoOff,h=c`<span class="p-name">${d}</span>
    <span class="p-sub">${l}</span>`,f=p?Or(t,e.autoOff,s(n,"auto_off_title"),()=>t.toggleSwitch(e.autoOff)):u,g=a&&p&&!i?.switching&&e.autoOffSkip&&v(n,e.autoOffSkip)?.state!=="unavailable"?$({label:s(n,"auto_off_skip"),iconName:"timerOff",pending:t.isPending(`skip_${e.autoOffSkip}`),onClick:()=>t.run(`skip_${e.autoOffSkip}`,"button","press",{entity_id:e.autoOffSkip})}):u;return c`<div class="p-row p-auto ${a?"waiting":""}">
      <span class="p-icon" aria-hidden="true">${b(i?.armed||r?"timer":"timerOff")}</span>
      ${p&&e.autoOffTemperature?c`<button class="p-text p-open" aria-label="${d}: ${l}" aria-haspopup="dialog" @click=${t.openAutoOff}>
            <span class="p-open-text">${h}</span><span class="p-chevron" aria-hidden="true">${b("chevronRight")}</span>
          </button>`:c`<span class="p-text">${h}</span>`}
      ${f}
    </div>
    ${g===u?u:c`<div class="p-skip">${g}</div>`}`}function Fr(t,e=!1){let n=qe(t);return(e?Ft(t).filter(r=>r!==n):Ft(t)).map(r=>c`${da(t,r,r===n)}${r===n?ca(t,r):u}`)}function Pr(t){let e=Fr(t,!t.online&&Fn(t)!==void 0);return e.length?c`<section class="power" aria-labelledby="power-title">
    <div class="speed-label" id="power-title">${b("bolt")}<span>${s(t.hass,"power_title")}</span></div>
    <div class="power-box">${e}</div>
  </section>`:u}function Nr(t){return c`<h2 id="dlg-title">${s(t.hass,"power_title")}</h2>
    <div class="power-box">${Fr(t)}</div>`}function Vr(t){let{hass:e}=t,n=qe(t),i=n?Nt(t,n):void 0,r=n?.autoOffTemperature,o=V(e,r),a=(_,m)=>{let y=v(e,r)?.attributes[_];return typeof y=="number"?y:G(m,o)},d=a("min",na),l=a("max",ia),p=(r?t.targetOf(r):void 0)??i?.temperature??G(Pt,o),h=i?.every??!1,f=[!1,!0],g=_=>{n?.autoOffEveryPrint&&_!==h&&t.run(`every_${n.autoOffEveryPrint}`,"switch",_?"turn_on":"turn_off",{entity_id:n.autoOffEveryPrint})};return c`<h2 id="dlg-title">${s(e,"auto_off_title")}</h2>
    <p class="dlg-label" id="auto-off-temperature">${s(e,"auto_off_temperature")}</p>
    ${wt({labelledBy:"auto-off-temperature",centered:!0,lower:{label:s(e,"auto_off_lower",{step:Ot,unit:o}),disabled:!r||p<=d,onClick:()=>r&&t.stepTarget(r,Math.max(d,p-Ot))},raise:{label:s(e,"auto_off_raise",{step:Ot,unit:o}),disabled:!r||p>=l,onClick:()=>r&&t.stepTarget(r,Math.min(l,p+Ot))},value:H(e,p,o)})}
    <p class="dlg-label" id="auto-off-when">${s(e,"auto_off_when")}</p>
    <div class="seg auto-off-when" role="radiogroup" aria-labelledby="auto-off-when" @keydown=${J} @focusout=${I}>
      ${f.map((_,m)=>c`<button
          role="radio"
          aria-checked=${_===h?"true":"false"}
          tabindex=${m===Q(f,h)?"0":"-1"}
          @click=${()=>g(_)}
        >
          ${s(e,_?"auto_off_every_choice":"auto_off_next_choice")}
        </button>`)}
    </div>
    <p class="hint">${s(e,"auto_off_dialog_note")}</p>`}function Ir(t,e){let{hass:n}=t,i=qe(t)??Ft(t).find(y=>y.power);if(!i)return u;let r=Ye(t,i),o=S(n,i.watts),a=o!==void 0?ke(n,o):void 0,[d,l,p,h]=t.unreachable?["neutral","plug",s(n,"chip_power_unknown"),s(n,"chip_power_unknown_short")]:r==="unavailable"?["warn","plugOff",s(n,"chip_power_unreachable"),s(n,"chip_power_unreachable_short")]:r==="off"?["neutral","plugOff",s(n,"chip_power_off"),s(n,"off")]:r!=="on"?["neutral","plug",s(n,"chip_power_unknown"),s(n,"chip_power_unknown_short")]:Rr(t,i)?["info","timer",s(n,"auto_off_waiting_title"),s(n,"auto_off_waiting_short")]:[t.online?"ok":"neutral","bolt",a??s(n,"chip_power_on"),a??s(n,"on")],f=!t.unreachable&&!Mn(t,i)&&(r==="on"||r==="off")&&!Rr(t,i),g=f?r==="on"&&a?s(n,"chip_power_plug",{plug:i.name,power:a}):s(n,"chip_power_plug_state",{plug:i.name,state:s(n,r==="on"?"on":"off")}):p,_=f?g:t.unreachable?`${g} \u2013 ${s(n,ee(t))}`:s(n,"chip_power_aria",{shown:g,plug:i.name}),m=t.settings.compactChips?h:g;return c`<button class="pill power-chip tone-${d}" aria-label=${_} title=${_} aria-haspopup="dialog" aria-live="off" @click=${e}>${b(l)}<span>${m}</span></button>`}var pa=t=>{let e=Math.max(0,Math.floor(t/1e3));return`${Math.floor(e/60)}:${String(e%60).padStart(2,"0")}`};function On(t,e=Date.now()){let n=qe(t);if(t.online||t.unreachable||!n||Ye(t,n)!=="on")return;let i=X(t.hass,n,"on_since"),r=typeof i=="string"?e-new Date(i).getTime():Number.NaN;return r>=0&&r<ta?r:void 0}function Fn(t){let{hass:e}=t,n=qe(t);if(t.online||t.unreachable||!n)return;let i=Ye(t,n),r=S(e,n.watts),o=n.switchable&&Ge(t);if(i==="off"){let l=Nt(t,n),p=l?.phase==="done"?l.since:void 0,h=p!==void 0?dt(e,p):void 0,f=`plug_${n.power}`;return{info:c`${E(s(e,"offline_plug_off",{plug:n.name}),"info")}${h?c`<p class="hint">${s(e,"auto_off_done_at",{time:h})}</p>`:u}`,actions:o?c`<div class="offline-actions">
              ${$({label:s(e,"power_on"),iconName:"power",kind:"primary",pending:t.isPending(f),onClick:()=>t.run(f,"switch","turn_on",{entity_id:n.power})})}
            </div>`:c``}}if(i!=="on")return;let a=On(t);if(a!==void 0)return{info:c`<div class="p-starting">
        <span class="check-spinner" aria-hidden="true"></span>
        <span class="p-text">
          <span class="p-name">${s(e,"power_starting",{time:pa(a)})}</span>
          <span class="p-sub">${s(e,"power_starting_text")}</span>
          ${r!==void 0?c`<span class="p-sub">${s(e,"power_plug_on",{power:ke(e,r)})}</span>`:u}
        </span>
      </div>`,actions:c``};let d=r===void 0?u:c`<p class="hint">${r>0?s(e,"offline_plug_on_power",{power:ke(e,r)}):s(e,"offline_plug_on_zero")}</p>`;if(!(d===u&&!o))return{info:c`${E(s(e,"offline_text"),"warning")}${d}`,actions:c`<div class="offline-actions">
      ${$({label:s(e,"check_connection"),iconName:"lan",onClick:t.checkConnection})}
      ${o?$({label:s(e,"power_off_plug"),iconName:"power",onClick:()=>Rn(t,n,!1)}):u}
    </div>`}}var Vt=(t,e,n)=>ye(v(t.hass,e)?.attributes[n]),ua=t=>/^(.+) \([^()]* \/ [^()]*\)$/.exec(t)?.[1]??t,K=t=>Vt(t,t.refs.status,"bambuddy_name")??ua(t.refs.name),jr=(t,e)=>{let n=S(t.hass,e);return n===void 0?void 0:T(t.hass,n,2)};function ha(t){let{hass:e,refs:n}=t,i=n.nozzleDiameters.map(d=>jr(t,d)),r=i.filter(d=>d!==void 0);if(!r.length)return;if(new Set(r).size===1)return`${r[0]}\xA0mm`;let[o,a]=i;return`${s(e,"side_left_short")}\xA0${o??"\u2014"} / ${s(e,"side_right_short")}\xA0${a??"\u2014"}\xA0mm`}function Ur(t){let{hass:e,refs:n}=t,i=S(e,n.printHours);if(i!==void 0)return typeof e.formatEntityState=="function"?e.formatEntityState(v(e,n.printHours)):s(e,"dur_h",{h:T(e,Math.round(i))})}var Wr=t=>[t.refs.model,ha(t),Ur(t)].filter(Boolean).join(" \xB7 "),Zr={RESUME_PRINTING:"hms_answer_resume_printing",RESUME_PRINTING_DEFECTS:"hms_answer_resume_printing_defects",RESUME_PRINTING_PROBELM_SOLVED:"hms_answer_resume_printing_probelm_solved",PROBLEM_SOLVED_RESUME:"hms_answer_problem_solved_resume",FILAMENT_LOAD_RESUME:"hms_answer_filament_load_resume",PROCEED:"hms_answer_proceed",DBL_CHECK_RESUME:"hms_answer_dbl_check_resume",STOP_PRINTING:"hms_answer_stop_printing",IGNORE_RESUME:"hms_answer_ignore_resume",IGNORE_NO_REMINDER_NEXT_TIME:"hms_answer_ignore_no_reminder_next_time",DONT_REMIND_NEXT_TIME:"hms_answer_dont_remind_next_time",NO_REMINDER_NEXT_TIME:"hms_answer_no_reminder_next_time",FILAMENT_EXTRUDED:"hms_answer_filament_extruded",DBL_CHECK_DONE:"hms_answer_dbl_check_done",RETRY_FILAMENT_EXTRUDED:"hms_answer_retry_filament_extruded",CONTINUE:"hms_answer_continue",RETRY_PROBLEM_SOLVED:"hms_answer_retry_problem_solved",DBL_CHECK_RETRY:"hms_answer_dbl_check_retry",ABORT:"hms_answer_abort",OK_BUTTON:"hms_answer_ok_button",DBL_CHECK_OK:"hms_answer_dbl_check_ok",REFRESH_NOZZLE:"hms_answer_refresh_nozzle",TURN_OFF_FIRE_ALARM:"hms_answer_turn_off_fire_alarm",STOP_DRYING:"hms_answer_stop_drying",DISABLE_PURIFICATION:"hms_answer_disable_purification"};function Gr(t){return Array.isArray(t.actions)?t.actions.filter(e=>typeof e=="string"&&Object.hasOwn(Zr,e)):[]}function Nn(t){return t.canControl&&t.online&&Xe(t).errors.some(e=>Gr(e).length>0)}var fa="https://wiki.bambulab.com/en/hms/home";function ma(t,e,n){let{hass:i,refs:r}=t,o=Gr(e);if(!o.length||!t.canControl||!t.online||typeof e.code!="string")return u;let a=e.code;return c`<div class="hms-answers">
    ${o.map(d=>{let l=`hms_${a}_${d}`,p=s(i,Zr[d]),h={device_id:r.deviceId,code:a,action:d},f=d==="STOP_PRINTING";return $({label:p,iconName:f?"stop":"check",kind:f?"danger":"tonal",pending:t.isPending(l),describedBy:n,answer:l,onClick:()=>f?t.confirm(ht(i,["bambuddy","answer_hms",h],l)):t.run(l,"bambuddy","answer_hms",h)})})}
  </div>`}var qr=["error","warning","unknown","notice"];function ga(t){let e=typeof t=="string"?t.replace(/^0x/i,"").toUpperCase():"";return/^[0-9A-F]{8}([0-9A-F]{8})?$/.test(e)?e.match(/.{4}/g).join("_"):e}var It=t=>typeof t.severity=="string"&&qr.includes(t.severity)?t.severity:"unknown",Yr={error:"error",warning:"warning",unknown:"warning",notice:"info"},_a=t=>t==="unknown"?"warning":t,Jr={error:"err",warning:"warn",unknown:"warn",notice:"info"};function Vn(t){let e=n=>qr.indexOf(It(n));return[...t].sort((n,i)=>e(n)-e(i))}function Xe(t){let e=v(t.hass,t.refs.hms)?.attributes.errors,n=Array.isArray(e)?e:[],i=S(t.hass,t.refs.hms)??(Array.isArray(e)?n.length:void 0);return i===void 0?{errors:n}:{count:i,errors:n}}var In=t=>!!t.refs.clearHms&&t.canControl&&(Xe(t).count??0)>0,ba=t=>t>=-67?"ok":t>=-75?"warn":"err",wa=(t,e)=>`${T(t.hass,e).replace(/^-/,"\u2212")}\xA0dBm`;function Xr(t){let{hass:e,refs:n}=t;if(!t.online)return;if(v(e,n.wiredNetwork)?.state==="on")return{tone:"ok",iconName:"ethernet",text:s(e,"lan"),aria:s(e,"lan_aria"),entityId:n.wiredNetwork};let i=S(e,n.wifiSignal);if(i===void 0)return;let r=wa(t,i),o=ba(i),a=s(e,o==="ok"?"wifi_good":o==="warn"?"wifi_fair":"wifi_weak");return{tone:o,iconName:"wifi",text:r,aria:s(e,"wifi_signal",{value:r,quality:a}),entityId:n.wifiSignal}}function va(t){let e=Xr(t);if(!e)return u;let n=c`${b(e.iconName)}<span>${e.text}</span>`;return c`<button
    class="pill network tone-${e.tone}"
    aria-label=${e.aria??e.text}
    title=${e.aria??e.text}
    aria-live="off"
    @click=${()=>t.moreInfo(e.entityId)}
  >
    ${n}
  </button>`}function ya(t,e){let{hass:n}=t,{count:i,errors:r}=Xe(t);if(!t.online||i===void 0)return u;let o=Vn(r)[0],a=i>0?Jr[o?It(o):"unknown"]:"ok",d=i>1?s(n,"hms_pill_aria",{count:i}):i===1?s(n,"hms_pill_aria_one"):s(n,"hms_pill_none"),l=t.settings.compactChips?he(i>0?String(i):s(n,"chip_ok"),d):c`<span>${i>0?d:s(n,"hms_ok")}</span>`;return c`<button class="pill hms tone-${a}" aria-label=${d} title=${d} aria-haspopup="dialog" @click=${()=>e("hms")}>
    ${b(i>0?"shieldAlert":"shieldCheck")}${l}
  </button>`}function Kn(t){let{refs:e}=t,n=v(t.hass,e.firmware);if(!n)return;let i=Vt(t,e.firmware,"installed_version"),r=Vt(t,e.firmware,"latest_version");return{...i?{installed:i}:{},...r?{latest:r}:{},update:n.state==="on",current:n.state==="off"}}function xa(t,e){let{hass:n}=t,i=Kn(t);if(!i||!i.installed&&!i.update)return u;let[r,o,a]=i.update?["warn","download","firmware_update"]:!t.online&&i.installed?["neutral","memory",t.unreachable?"firmware_unreachable":"firmware_offline"]:i.current?["ok","check","firmware_current"]:["neutral","memory","firmware_version"],d=i.update&&i.latest?t.settings.compactChips?i.latest:s(n,"firmware_update_chip",{version:i.latest}):i.installed??s(n,"firmware"),l=i.update&&i.latest&&i.installed?s(n,"firmware_update_label",{latest:i.latest,version:i.installed}):i.installed?s(n,a,{version:i.installed}):i.update&&i.latest?s(n,"firmware_update_chip",{version:i.latest}):d;return c`<button class="pill firmware tone-${r}" aria-label=${l} title=${l} aria-haspopup="dialog" @click=${()=>e("firmware")}>
    ${b(o)}${t.settings.compactChips?he(d,l):c`<span>${d}</span>`}
  </button>`}var ka=new Set(["paused","failed"]);function $a(t,e){let{hass:n}=t,{count:i,errors:r}=Xe(t);if(!t.online||!i)return u;let o=Vn(r),a=o[0],d=a?It(a):"unknown";if(d!=="error"&&!ka.has(t.status))return u;let l=ye(a?.description),p=a?l??s(n,`hms_${d}`):s(n,"hms_count",{count:i}),h=o.length-1;return c`<button class="hms-line tone-${Jr[d]}" title=${p} aria-haspopup="dialog" @click=${()=>e("hms")}>
    ${b(Yr[d])}<span class="hms-line-text">${p}</span>${h>0?c`<span class="hms-line-more">${s(n,"hms_more",{n:h})}</span>`:u}<span class="hms-line-go">${b("chevronRight")}</span>
  </button>`}function Sa(t){let{hass:e,refs:n}=t;if(!t.online||v(e,n.door)?.state!=="on")return u;let i=s(e,"door_open"),r=t.settings.compactChips;return c`<button class="pill door tone-info ${r?"icon-only":""}" aria-label=${i} title=${i} @click=${()=>t.moreInfo(n.door)}>
    ${b("doorOpen")}${r?he(void 0,i):c`<span>${i}</span>`}
  </button>`}function Ca(t,e){let{hass:n,refs:i}=t;if(!t.online||v(n,i.storage)?.state!=="off")return u;let r=s(n,i.storageUsb?"storage_usb_chip_title":"storage_sd_chip_title"),o=t.settings.compactChips;return c`<button class="pill storage tone-warn ${o?"icon-only":""}" aria-label=${r} title=${r} aria-haspopup="dialog" @click=${()=>e("storage")}>
    ${b(i.storageUsb?"usb":"sd")}${o?he(void 0,r):c`<span>${s(n,i.storageUsb?"storage_usb":"storage_sd")}</span>`}
  </button>`}function Ta(t){let{hass:e}=t;if(!t.online)return u;let n=t.ams.filter(g=>g.drying&&v(e,g.drying)?.state==="on"),i=n[0];if(!i)return u;let r=n.map(g=>ve(e,g.dryingRemaining)).filter(g=>g!==void 0&&g>0),o=r.length?q(e,Math.max(...r)).replace(/ /g,"\xA0"):void 0,a=n.length,d=a===1?s(e,"dry_chip_one_bare"):s(e,"dry_chip_many_bare",{n:a}),l=o?a>1?s(e,"dry_chip_aria",{n:a,time:o}):s(e,"dry_chip_unit_aria",{unit:i.name,time:o}):a>1?d:s(e,"dry_chip_unit",{unit:i.name}),p=t.settings.compactChips&&o!==void 0,h=p?a>1?s(e,"dry_chip_many_short",{n:a}):void 0:d;return c`<button class="pill dry-chip tone-info" aria-label=${p?l:u} title=${l} aria-live="off" @click=${()=>t.filamentTab?t.show("filament"):t.moreInfo(i.dryingRemaining??i.drying)}>
    ${b("heat")}<span class="dry-text">${h?c`<span>${h}</span> `:u}${o?c`<span class="dry-time">${o}</span>`:u}</span>
  </button>`}function Qr(t,e){let n={network:()=>va(t),hms:()=>ya(t,e),firmware:()=>xa(t,e),maintenance:()=>Dr(t,()=>e("maintenance")),door:()=>Sa(t),storage:()=>Ca(t,e),drying:()=>Ta(t),power:()=>Ir(t,()=>e("power"))},i=t.settings.chips.map(r=>n[r]()).filter(r=>r!==u);return c`${i.length?c`<div class="pills" aria-live="polite">${i}</div>`:u}${$a(t,e)}`}function eo(t){let{hass:e}=t,{count:n=0,errors:i}=Xe(t),r=Vn(i),o=t.unreachable||!t.online?D(s(e,t.unreachable?ee(t):"offline_text")):r.length?c`<div class="hms-list">
            ${r.map((l,p)=>{let h=It(l),f=ga(l.code),g=ye(l.description);return c`<div class="hms-item sev-${_a(h)}">
                ${b(Yr[h])}
                <div class="hms-body">
                  ${g?c`<span class="sr-only">${s(e,`hms_${h}`)}: </span>`:u}<span class="hms-text" id="hms-text-${p}">${g??s(e,"hms_no_text",{severity:s(e,`hms_${h}`)})}</span>
                  ${f?c`<span class="hms-code">${f}</span>`:u}
                  ${ma(t,l,`hms-text-${p}`)}
                </div>
              </div>`})}
          </div>`:c`<p class="hms-empty">${n>0?s(e,"hms_count",{count:n}):s(e,"hms_none_dialog")}</p>`,a=Nn(t)?"hms_next_answers":t.canControl?"hms_next":t.refs.resume||t.refs.stop?"hms_next_read":"hms_next_elsewhere",d=t.status==="paused"&&n>0?D(s(e,a)):u;return c`<h2 id="dlg-title">${s(e,"hms_title")}</h2>
    ${o}
    ${r.length?c`<a class="hms-wiki" href=${fa} target="_blank" rel="noopener noreferrer">${b("openInNew")}<span>${s(e,"hms_wiki")}</span></a>`:u}
    ${d}${In(t)?D(s(e,"hms_clear_note")):u}`}function O(t,e,n=u,i=""){return c`<div class="spec-row">
    <span class="spec-label">${t}</span>
    <span class="spec-value ${i}">${e}</span>
    ${n}
  </div>`}function to(t){let{hass:e,refs:n}=t,i=v(e,n.storage)?.state==="on",r=n.storageUsb?i?"storage_usb_in":"storage_usb_text":i?"storage_sd_in":"storage_sd_text",o=n.storageUsb?i?"storage_usb_title_in":"storage_usb":i?"storage_sd_title_in":"storage_sd";return c`<h2 id="dlg-title">${s(e,o)}</h2>
    <p>${s(e,r)}</p>`}function no(t,e){let{hass:n}=t,i=Kn(t)??{update:!1,current:!1},r=()=>{e(),t.moreInfo(t.refs.firmware)};return c`<h2 id="dlg-title">${s(n,"firmware")}</h2>
    <div class="spec">
      ${i.installed?O(s(n,"firmware_installed"),i.installed):u}
      ${i.latest?O(s(n,i.update?"firmware_available":"firmware_latest"),i.latest,u,i.update?"update":""):u}
    </div>
    ${i.update?c`<button class="btn release" @click=${r}>${b("openInNew")}<span>${s(n,"firmware_notes")}</span></button>`:u}
    ${D(s(n,"firmware_note"))}`}var Aa=()=>typeof navigator.clipboard?.writeText=="function";function Je(t,e){let{hass:n,refs:i}=t,r=jr(t,i.nozzleDiameters[e]),o=i.nozzleTypes[e];return[r===void 0?void 0:`${r}\xA0mm`,R(n,o)?M(n,o):void 0].filter(Boolean).join(" \xB7 ")}function Kr(t){let{hass:e,refs:n}=t;return n.nozzles.map((i,r)=>{let o=Je(t,r);return o&&s(e,"nozzle_side",{side:Ce(e,r),nozzle:o})}).filter(Boolean)}function io(t,e){let{hass:n,refs:i}=t;if(!i.dual){let l=Je(t,0);return l?[s(n,"nozzle_side",{side:s(n,"nozzle"),nozzle:l})]:[]}let r=i.externalSpools.length===2?i.externalSpools.indexOf(e):i.externalSpools.includes(e)?-2:-1;if(r===-2)return Kr(t);let o=v(n,e)?.attributes.nozzle,a=r>=0?r:o==="left"?0:o==="right"?1:void 0;if(a===void 0)return Kr(t);let d=Je(t,a);return d?[s(n,"nozzle_side",{side:s(n,a===0?"nozzle_left":"nozzle_right"),nozzle:d})]:[]}var Pn=(t,e)=>c`<span class="chip tone-${t}">${e}</span>`;function za(t){let{hass:e,refs:n}=t;if(!n.dual){let r=Je(t,0);return r?O(s(e,"info_nozzle"),r):u}let i=n.nozzles.map((r,o)=>[o,Je(t,o)]).filter(([,r])=>r);return i.length?O(s(e,"info_nozzles"),c`${i.map(([r,o])=>{let a=s(e,r===0?"nozzle_left":"nozzle_right"),d=s(e,r===0?"side_left_short":"side_right_short");return c`<span
        ><span class="spec-side" title=${a}>${b("nozzle")}<span aria-hidden="true">${d}:</span><span class="sr-only">${a}:</span></span>
        ${o}</span
      > `})}`,u,"lines"):u}function ro(t,e,n){let{hass:i,refs:r}=t,o=(y,w)=>Aa()?c`<button class="icon-btn copy" aria-label=${s(i,y)} title=${s(i,y)} @click=${()=>n(w)}>${b("copy")}</button>`:u,a=Vt(t,r.status,"bambuddy_name"),d=R(i,r.ipAddress)?v(i,r.ipAddress)?.state:void 0,l=i.devices[r.deviceId],p=l?.serial_number||void 0,h=l?.via_device_id?i.devices[l.via_device_id]:void 0,f=Xr(t),g=R(i,r.developerMode)?v(i,r.developerMode)?.state==="on":void 0,_=Ur(t),m=Kn(t)?.installed;return c`<h2 id="dlg-title">${s(i,"menu_info")}</h2>
    <div class="spec">
      ${a?O(s(i,"info_name"),a):u}
      ${r.model?O(s(i,"info_model"),r.model):u}
      ${p?O(s(i,"info_serial"),p,o("copy_serial",p)):u}
      ${m?O(s(i,"firmware"),m):u}
      ${za(t)}
      ${_?O(s(i,"info_hours"),_):u}
      ${O(s(i,"info_status"),Pn(t.online?"ok":t.unreachable?"warn":"off",s(i,$e(t))))}
      ${t.online?O(s(i,"info_print_status"),M(i,r.status,t.status)??t.status):u}
      ${f?O(s(i,"info_network"),f.iconName==="wifi"?`${s(i,"wifi")} \xB7 ${f.text}`:s(i,"lan_wired")):u}
      ${d?O(s(i,"info_ip"),d,o("copy_ip",d)):u}
      ${g===void 0?u:g?O(s(i,"info_developer"),Pn("ok",s(i,"info_on"))):O(s(i,"info_developer"),c`${Pn("warn",s(i,"info_off"))} <span class="spec-sub">${s(i,"info_developer_note")}</span>`,u,"lines")}
      ${h&&Ze(h)?O(s(i,"info_server"),Ze(h)):u}
    </div>
    ${e?gt("dlg-snack",s(i,"copied")):u}`}var B={temperature:55,duration:8,minTemperature:45,maxTemperature:85,maxTemperatureAms2Pro:65,minDuration:1,maxDuration:24},oo={temperature:["dry_temperature_lower","dry_temperature_raise"],duration:["dry_duration_lower","dry_duration_raise"]},Qe="keep",Da=.02,F="keep",po=[{color:"#FFFFFF",name:"color_white"},{color:"#000000",name:"color_black"},{color:"#8E9089",name:"color_gray"},{color:"#A6A9AA",name:"color_silver"},{color:"#C12E1F",name:"color_red"},{color:"#FF6A13",name:"color_orange"},{color:"#F4EE2A",name:"color_yellow"},{color:"#00AE42",name:"color_green"},{color:"#00A6A0",name:"color_turquoise"},{color:"#0086D6",name:"color_cyan"},{color:"#0A2989",name:"color_blue"},{color:"#5E43B7",name:"color_purple"},{color:"#F55A74",name:"color_pink"},{color:"#9D432C",name:"color_brown"},{color:"#F7E6DE",name:"color_beige"},{color:"#E4BD68",name:"color_gold"}],qn=t=>po.some(e=>e.color===t);function Ut(t){let e=t.offer;if(!(typeof e!="object"||!e.current))return e.vendors.find(n=>n.filaments.some(i=>i.id===e.current))?.name}function ie(t){let e=t.offer;if(!(typeof e!="object"||t.filament===void 0||t.filament===F))return e.vendors.flatMap(n=>n.filaments).find(n=>n.id===t.filament)}var Kt=t=>t.vendor===F||t.filament===F,uo=t=>typeof t.offer=="object"&&t.offer.vendors.length===0,ho=t=>(uo(t)||t.offer==="failed")&&t.keep===void 0;function La(t){let e=ie(t);if(e)return e.id;if(!Kt(t))return;if(typeof t.offer=="object")return t.offer.current;let n=t.kprofiles;return typeof n=="object"&&n.profiles.find(i=>i.index===n.current)?.filamentId||void 0}function Ha(t){let e=t.offer;if(!(typeof e!="object"||!e.current))return e.vendors.flatMap(n=>n.filaments).find(n=>n.id===e.current)?.name}function Wt(t){let e=ie(t),n=e?{filament:e.id}:{},i=t.color,r=i!==void 0&&i!==t.current,o=t.kprofile!==void 0&&t.kprofile!==Qe?Number(t.kprofile):void 0,a=typeof t.kprofiles=="object"?t.kprofiles.current:void 0,d=o!==void 0&&(e?o!==-1:o!==a);return{...n,...r?{color:gn(i)}:{},...d?{k_profile:o}:{}}}function Yn(t){let e=t.kprofiles,n=ie(t)?.id;if(typeof e!="object"||n===void 0)return;let i=e.profiles.find(r=>r.filamentId===n);return i?String(i.index):void 0}function so(t,e,n){let{label:i,field:r,value:o,unit:a,min:d,max:l,step:p}=n,h=`dry-${r}`,f=r==="duration"?s(t,"hours_long"):a;return c`<div class="field">
    <label for=${h}>${i}<span class="sr-only"> (${f})</span></label>
    <div class="stepper">
      <button class="btn icon-only" aria-label=${s(t,oo[r][0])} ?disabled=${o<=d} @click=${()=>e.setDrying(r,o-p)}>
        ${b("minus")}
      </button>
      <input
        id=${h}
        type="number"
        inputmode="numeric"
        min=${d}
        max=${l}
        .value=${String(o)}
        @change=${g=>{let _=g.target;_.value=String(e.setDrying(r,_.value.trim()===""?Number.NaN:Number(_.value)))}}
      />
      <span class="unit-text">${a}</span>
      <button class="btn icon-only" aria-label=${s(t,oo[r][1])} ?disabled=${o>=l} @click=${()=>e.setDrying(r,o+p)}>
        ${b("plus")}
      </button>
    </div>
  </div>`}function Ea(t,e){if(e.differing.length){let i=e.differing.map(r=>`${r.material}\xA0${H(t,r.temperature)}`).join(" \xB7 ");return c`<p class="dlg-suggested mixed">${b("info")}<span>${s(t,"dry_mixed",{spools:i})}</span></p>`}if(!e.suggested)return u;let n=e.suggestedFor?s(t,"dry_suggested_for",{filaments:e.suggestedFor}):s(t,"dry_suggested");return c`<p class="dlg-suggested">${b("check")}<span>${n}</span></p>`}function Ra(t,e,n){return c`<h2 id="dlg-title">${s(t,"dry_title",{unit:e.unit.name})}</h2>
    ${so(t,n,{label:s(t,"dry_temperature"),field:"temperature",value:e.temperature,unit:"\xB0C",min:B.minTemperature,max:e.maxTemperature,step:5})}
    ${so(t,n,{label:s(t,"dry_duration"),field:"duration",value:e.duration,unit:s(t,"hours"),min:B.minDuration,max:B.maxDuration,step:1})}
    ${Ea(t,e)}
    <p class="dlg-range">
      ${H(t,B.minTemperature)} – ${H(t,e.maxTemperature)} · ${B.minDuration}–${B.maxDuration}
      ${s(t,"hours")}
    </p>`}var fo=t=>t.chosen.length>0&&t.objects.every(e=>e.skipped||t.chosen.includes(e.id));function Ma(t,e,n){let i;return e.loading?i=c`<p role="status">${s(t,"skip_loading")}</p>`:e.error?i=c`<div class="dlg-error" role="alert">${b("error")}<span>${e.error}</span></div>`:e.objects.length?e.objects.length===1?i=c`<p class="dlg-warn info">${b("info")}<span>${s(t,"skip_single")}</span></p>`:i=c`<div class="objects" role="group" aria-labelledby="dlg-title">
        ${e.objects.map(r=>c`<label class="obj ${r.skipped?"skipped":""}">
            <input
              type="checkbox"
              .checked=${e.chosen.includes(r.id)}
              ?disabled=${r.skipped}
              @change=${()=>n.toggleObject(r.id)}
            />
            <span class="obj-name">${r.name||s(t,"skip_object",{id:r.id})}</span>
            ${r.skipped?c`<span class="obj-note">${s(t,"skip_skipped")}</span>`:u}
          </label>`)}
      </div>
      <p class="dlg-warn">${b("warning")}<span>${s(t,fo(e)?"skip_all":"skip_text")}</span></p>`:i=c`<p>${s(t,"skip_none_listed")}</p>`,c`<h2 id="dlg-title">${s(t,"skip")}</h2>
    ${i}`}function ao(t,e,n,i,r){return c`<button
    class="pal ${Ke(n)?"outline":""}"
    role="radio"
    aria-checked=${t.color===n?"true":"false"}
    aria-label=${i}
    title=${i}
    tabindex=${r?0:-1}
    style="--c: ${n}"
    @click=${()=>e.setColor(n)}
  ></button>`}function Ba(t){let e=t.key==="ArrowRight"||t.key==="ArrowDown"?1:t.key==="ArrowLeft"||t.key==="ArrowUp"?-1:0,n=[...t.currentTarget.querySelectorAll("[role=radio]")],i=n.indexOf(t.target);if(!e||i<0)return;t.preventDefault();let r=n[(i+e+n.length)%n.length];r.focus(),r.click()}function Oa(t,e,n){let i=e.kprofiles,r=typeof i=="object"?i.profiles:[],o=typeof i=="object"?i.current:-1,a=Kt(e)&&ie(e)===void 0,d=La(e),l=d===void 0?[]:r.filter(x=>x.filamentId===d),p=ie(e)?.name??Ha(e)??e.keep??"",h=x=>`${x.name} (K ${fn(t,x.k,3)})`,f=a?r.find(x=>x.index===o):void 0,g=a?f?s(t,"k_keep",{profile:h(f)}):o>=0?s(t,"k_keep_number",{index:o}):i==="failed"||i==="loading"?s(t,e.ams?"k_keep_plain":"k_keep_plain_spool"):void 0:void 0,_=e.kprofile===Qe&&!g?"-1":e.kprofile??(g?Qe:"-1"),m=f?l.filter(x=>x.index!==f.index):l,y=typeof i=="object"&&!r.length?i:void 0,w=i==="loading"?c`<div class="k-wait ${e.kSlow?"slow":""}"><span class="check-spinner" aria-hidden="true"></span><span>${s(t,e.kSlow?"k_slow":"k_loading")}</span></div>`:y&&!y.answered?D(s(t,"k_no_answer"),"warning"):y?.diameter!==void 0?D(s(t,"k_none_saved",{diameter:`${T(t,y.diameter,2)}\xA0mm`})):c`<span class="k-hint">${s(t,i==="failed"?e.ams?"k_failed":"k_failed_spool":"k_unsure")}</span>`,k=x=>c`<option value=${String(x.index)} .selected=${_===String(x.index)}>${h(x)}</option>`;return c`<div class="field kfield">
      <label for="fil-k">${s(t,"k_profile")}</label>
      <span class="k-about" id="k-about">${s(t,"k_about")}</span>
      <span class="select">
        <select id="fil-k" aria-describedby="k-about k-hint" @change=${x=>n.setKProfile(x.target.value)}>
          ${g?c`<option value=${Qe} .selected=${_===Qe}>${g}</option>`:u}
          <option value="-1" .selected=${_==="-1"}>${s(t,"k_default",{k:fn(t,Da,3)})}</option>
          ${m.length?c`<optgroup label=${s(t,"k_matching",{material:p})}>${m.map(k)}</optgroup>`:u}
          ${He(_)}
        </select>
        ${b("chevronDown")}
      </span>
      <div class="k-hint-box" id="k-hint" aria-live="polite">${w}</div>
    </div>`}var Wn=class extends te{render(e){return u}update(e,[n]){let i=e.parentNode;return i instanceof HTMLSelectElement&&i.value!==n&&(i.value=n),u}},He=Ae(Wn);function Fa(t,e,n){let i=e.offer;if(typeof i=="object"&&i.vendors.length===0)return D(s(t,"offer_empty"));let r=typeof i=="object"?i.vendors:[],o=Ut(e),a=e.keep!==void 0&&o===void 0,d=typeof i=="object",l=r.find(h=>h.name===e.vendor),p=h=>h.target.value;return c`<div class="fil-fields"><div class="fil-grid"><div class="field">
      <label for="fil-vendor">${s(t,"vendor")}</label>
      <span class="select">
        ${Sn(d?"offer":String(i),c`<select id="fil-vendor" class=${e.vendor===void 0?"unset":""} ?disabled=${!d} @change=${h=>n.setVendor(p(h))}>
          ${a?c`<option value=${F} .selected=${e.vendor===F}>${s(t,"profile_keep")}</option>`:c`<option value="" disabled .selected=${e.vendor===void 0}>${s(t,"material_choose")}</option>`}
          ${r.map(h=>c`<option value=${h.name} .selected=${e.vendor===h.name}>${h.name}</option>`)}
          ${He(e.vendor??"")}
        </select>`)}
        ${b("chevronDown")}
      </span>
    </div>
    ${l?c`<div class="field">
          <label for="fil-filament">${s(t,"filament_field")}</label>
          <span class="select">
            ${Sn(l.name,c`<select id="fil-filament" class=${e.filament===void 0?"unset":""} @change=${h=>n.setFilament(p(h))}>
              ${e.keep!==void 0&&o===l.name?c`<option value=${F} .selected=${e.filament===F}>${s(t,"material_keep",{name:e.keep})}</option>`:c`<option value="" disabled .selected=${e.filament===void 0}>${s(t,"material_choose")}</option>`}
              ${l.filaments.map(h=>c`<option value=${h.id} .selected=${e.filament===h.id}>${h.name}</option>`)}
              ${He(e.filament??"")}
            </select>`)}
            ${b("chevronDown")}
          </span>
        </div>`:u}</div>${a&&d&&e.vendor===F?c`<p class="fil-keep">${Pa(t,e,i)}</p>`:u}</div>`}function Pa(t,e,n){let i=L(t,e.entityId).type;if(!n.current)return s(t,"profile_none",{type:i});let r=e.keep??"";return!r||r.toLocaleLowerCase()===i.toLocaleLowerCase()?s(t,"profile_own",{type:i}):s(t,"profile_current",{name:r})}function jn(t,e,n){let{hass:i,refs:r}=t,o=t.running,a=!e.ams,d=r.ams.flatMap(h=>h.slots.flatMap((f,g)=>L(i,f).active?[$t(i,h,f,g)]:[]))[0],l=r.externalSpools.findIndex(h=>L(i,h).active),p=d?s(i,"rfid_unload_hint",{slots:d}):l<0?void 0:s(i,r.externalSpools.length>1?l===0?"rfid_unload_hint_left":"rfid_unload_hint_right":"rfid_unload_hint_external");return c`<div class="slot-tools">
      ${e.ams?$({label:s(i,"rfid_read"),iconName:"sync",disabled:o||p!==void 0,onClick:n.refreshRfid}):u}
      ${e.empty?u:$({label:s(i,a?"spool_reset":"slot_reset"),iconName:"restore",disabled:o,onClick:n.resetSlot})}
    </div>
    ${o?D(s(i,a?"spool_tools_running":"slot_tools_running")):e.ams&&p?D(p):u}`}function Na(t,e){let n=io(t,e.entityId);return n.length?c`<div class="nozzle-line">${n.map(i=>c`<span>${b("nozzle")}${i}</span>`)}</div>`:u}var me=["set","inventory"];function Zt(t,e){return e.rfid?!1:e.inventoryOnly===!0||e.tab==="inventory"&&L(t,e.entityId).assignable}function Va(t,e,n){let i=e.tab??"set",r=o=>{let a=me.indexOf(i),d={ArrowRight:a+1,ArrowDown:a+1,ArrowLeft:a-1,ArrowUp:a-1,Home:0,End:me.length-1}[o.key];if(d===void 0)return;o.preventDefault();let l=me[(d+me.length)%me.length];o.currentTarget.querySelectorAll("[role=tab]")[me.indexOf(l)]?.focus(),n.setTab(l)};return c`<div class="seg inv-switch" role="tablist" aria-label=${s(t,"inv_tabs")} @keydown=${r}>
    ${me.map(o=>c`<button
          type="button"
          role="tab"
          id="inv-tab-${o}"
          aria-controls=${o===i&&o==="inventory"?"inv-panel":u}
          aria-selected=${o===i?"true":"false"}
          tabindex=${o===i?0:-1}
          @click=${()=>n.setTab(o)}
        >
          ${s(t,o==="set"?"inv_tab_set":"inv_tab_inventory")}
        </button>`)}
  </div>`}function Ia(t,e){let{hass:n}=t;return c`<div class="inv-card">
    <span class="inv-from">${s(n,"inv_from")}</span>
    <span class="inv-spool">${bn(e)}<span class="inv-name">${e.name}</span></span>
    <span class="inv-line">${wn(n,e)}</span>
    ${e.storage?c`<span class="inv-line">${s(n,"inv_stored",{location:e.storage})}</span>`:u}
    ${e.alsoAssigned.map(i=>c`<span class="inv-also">${b("warning")}<span>${s(n,"inv_also",{where:i.here?"":jt(t,i).at})}</span></span>`)}
  </div>`}function Ka(t,e,n,i){return i.assignable?el(t,e,n,i):u}var ja=5;function lo(t){return t===6?"AMS Lite":t>=128?`AMS HT ${String.fromCharCode(65+t-128)}`:`AMS ${String.fromCharCode(65+t)}`}var Ua=(t,e)=>t>=128?t:t===6?24+e:t*4+e;function jt(t,e){let{hass:n,refs:i}=t;if(e.samePrinter){if(e.amsId===255){let f=i.externalSpools.length>1?e.trayId===1?"_right":"_left":"";return{line:s(n,`inv_ext${f}`),at:s(n,`inv_other_ext${f}`),from:s(n,`inv_from_ext${f}`)}}let a=Ua(e.amsId,e.trayId),d=e.amsLabel??lo(e.amsId),l=e.amsId>=128?void 0:e.trayId+1;for(let h of i.ams)for(let f of h.slots){let g=t.hass.states[f]?.attributes??{};g.tray_id===a&&(d=e.amsLabel??h.name,l=h.model==="AMS HT"?void 0:typeof g.slot=="number"?g.slot:l)}let p=l===void 0?d:s(n,"inv_other_slot",{unit:d,slot:l});return{line:l===void 0?s(n,"inv_in_unit",{unit:d}):s(n,"inv_in_slot",{unit:d,slot:l}),at:p,from:p}}let r=e.amsLabel??lo(e.amsId),o=e.amsId===255?s(n,e.trayId===1?"inv_other_ext_right":"inv_other_ext"):e.amsId>=128?r:s(n,"inv_other_slot",{unit:r,slot:e.trayId+1});return{line:s(n,"inv_other",{printer:e.printerName,where:o}),at:s(n,"inv_at_printer",{printer:e.printerName,where:o}),from:s(n,"inv_from_printer",{printer:e.printerName,where:o})}}function Wa(t,e,n){let{hass:i}=t,r=e.place,o=e.id===n,a=e.storage?c`<span class="inv-where stored">${s(i,"inv_stored",{location:e.storage})}</span>`:u,d=c`${a}${o?c`<span class="inv-where here">${s(i,"inv_here")}</span>`:r&&!r.here?c`<span class="inv-where elsewhere">${jt(t,r).line}</span>`:u}`,l=e.also.map(h=>h.here?u:c`<span class="inv-where elsewhere">${jt(t,h).line}</span>`);if(!e.fits)return c`${d}${l}`;let p={not_for_ams:"inv_not_ams",not_for_nozzle:"inv_not_nozzle",not_for_printer:"inv_not_printer",by_chip:"inv_by_chip",printing:"inv_printing"}[e.fits];return c`${d}${l}<span class="inv-where off">${s(i,p,{printer:e.printing??""})}</span>`}function Za(t){let e=new Map;for(let n of t){if(!n.brand)continue;let i=n.brand.toLocaleLowerCase(),r=e.get(i)??new Map;r.set(n.brand,(r.get(n.brand)??0)+1),e.set(i,r)}return[...e.entries()].map(([n,i])=>[n,[...i.entries()].reduce((r,o)=>o[1]>r[1]?o:r)[0]]).sort((n,i)=>n[1].localeCompare(i[1],void 0,{sensitivity:"base"}))}function Ga(t,e){let n=e.toLocaleLowerCase().split(/\s+/).filter(r=>r&&!/^(?:nr|no)\.?$/.test(r)),i=[t.name,t.brand,t.material,t.colorName??"",t.storage??""].join(" ").toLocaleLowerCase();return n.map(r=>r.replace(/^(?:nr|no)\.(?=\d)/,"")).every(r=>/^\d+$/.test(r)?t.id===Number(r):i.includes(r))}var Zn=["vendor","material","location"],Gn={vendor:t=>t.brand.toLocaleLowerCase(),material:t=>t.material,location:t=>t.storage??""};function qa(t,e){let n={vendor:t.vendorFilter??"",material:t.materialFilter??"",location:t.locationFilter??""},i=(l,p,h)=>Zn.every(f=>f===h||!p[f]||Gn[f](l)===p[f]),r=(l,p)=>new Set(e.spools.filter(h=>i(h,l,p)).map(Gn[p]).filter(Boolean)),o={...n};for(let l of Zn)o[l]&&!r(n,l).has(o[l])&&(o[l]="");let a=l=>[...l].sort((p,h)=>p.localeCompare(h,void 0,{sensitivity:"base",numeric:!0})),d=r(o,"vendor");return{chosen:o,vendors:Za(e.spools).filter(([l])=>d.has(l)),materials:a(r(o,"material")),locations:a(r(o,"location"))}}function Ya(t,e,n,i){let r=e.spools.filter(a=>Zn.every(d=>!i.chosen[d]||Gn[d](a)===i.chosen[d])&&Ga(a,t.search??"")),o=new Map;for(let a of r)o.set(a.material,[...o.get(a.material)??[],a]);return[...o.entries()].sort((a,d)=>a[0].localeCompare(d[0],void 0,{sensitivity:"base"})).map(([a,d])=>[a,[...d].sort((l,p)=>+(p.id===n)-+(l.id===n))])}function Ja(t,e){let n=K(t);return t.changing?s(t.hass,"inv_busy_change",{printer:n}):void 0}function Xa(t){return e=>{let i=[...e.currentTarget.querySelectorAll(".inv-row:not([aria-disabled=true])")],r=i.indexOf(e.target),o=r>=0?r:i.findIndex(l=>l.getAttribute("aria-checked")==="true"),a={ArrowDown:o+1,ArrowRight:o+1,ArrowUp:o-1,ArrowLeft:o-1,Home:0,End:i.length-1};if(o<0||!(e.key in a)||i.length===0)return;e.preventDefault();let d=i[(a[e.key]+i.length)%i.length];d.focus(),t.chooseSpool(Number(d.dataset.spool))}}function Qa(t,e,n,i,r,o){let{hass:a}=t,d=e.chosenSpool===i.id,l=i.fits!==void 0,p=()=>{l||n.chooseSpool(i.id)},h=f=>{f.key!==" "&&f.key!=="Enter"||(f.preventDefault(),p())};return c`<div
    class="inv-row ${d?"chosen":""}"
    role="radio"
    data-spool=${i.id}
    aria-checked=${d?"true":"false"}
    aria-disabled=${l?"true":"false"}
    tabindex=${l?u:r?0:-1}
    @click=${p}
    @keydown=${h}
  >
    ${bn(i)}
    <span class="inv-row-text">
      <span class="inv-name">${i.name}</span>
      <span class="inv-line">${wn(a,i)}</span>
      ${Wa(t,i,o)}
    </span>
  </div>`}function el(t,e,n,i){let{hass:r}=t,o=e.spools;if(o===void 0||o==="loading")return c`<div id="inv-panel" role="tabpanel" aria-labelledby="inv-tab-inventory">
      <div class="k-wait inv-wait"><span class="check-spinner" aria-hidden="true"></span><span>${s(r,"inv_loading")}</span></div>
    </div>`;if(o==="failed")return c`<div id="inv-panel" role="tabpanel" aria-labelledby="inv-tab-inventory">${D(s(r,"inv_failed"),"warning")}</div>`;let a=i.inventory?.id,d=o.spools.length>=ja,l=qa(e,o),p=Ya(e,o,a,l),h=p.flatMap(([,w])=>w),f=h.filter(w=>w.fits===void 0),g=f.find(w=>w.id===e.chosenSpool)?.id??f[0]?.id,_=o.spools.find(w=>w.id===e.chosenSpool),m=_&&_.id!==a&&_.place&&!_.place.here?jt(t,_.place).from:void 0,y=w=>w.target.value;return c`<div id="inv-panel" role="tabpanel" aria-labelledby="inv-tab-inventory" class="inv-panel">
    ${d?c`<div class="inv-filters">
            <label class="field"
              ><span class="field-label">${s(r,"inv_vendor")}</span>
              <span class="select"
                ><select id="inv-vendor" @change=${w=>n.filterSpools("vendor",y(w))}>
                  <option value="" .selected=${!l.chosen.vendor}>${s(r,"inv_all")}</option>
                  ${l.vendors.map(([w,k])=>c`<option value=${w} .selected=${l.chosen.vendor===w}>${k}</option>`)}
                  ${He(l.chosen.vendor)}
                </select>
                ${b("chevronDown")}</span
              ></label
            >
            <label class="field"
              ><span class="field-label">${s(r,"inv_material")}</span>
              <span class="select"
                ><select id="inv-material" @change=${w=>n.filterSpools("material",y(w))}>
                  <option value="" .selected=${!l.chosen.material}>${s(r,"inv_all")}</option>
                  ${l.materials.map(w=>c`<option value=${w} .selected=${l.chosen.material===w}>${w}</option>`)}
                  ${He(l.chosen.material)}
                </select>
                ${b("chevronDown")}</span
              ></label
            >
            ${o.spools.some(w=>w.storage)?c`<label class="field inv-wide"
                  ><span class="field-label">${s(r,"inv_location")}</span>
                  <span class="select"
                    ><select id="inv-location" @change=${w=>n.filterSpools("location",y(w))}>
                      <option value="" .selected=${!l.chosen.location}>${s(r,"inv_all")}</option>
                      ${l.locations.map(w=>c`<option value=${w} .selected=${l.chosen.location===w}>${w}</option>`)}
                      ${He(l.chosen.location)}
                    </select>
                    ${b("chevronDown")}</span
                  ></label
                >`:u}
          </div>
          <input
            id="inv-search"
            class="inv-search"
            type="search"
            aria-label=${s(r,"inv_search")}
            placeholder=${s(r,"inv_search")}
            .value=${e.search??""}
            @input=${w=>n.searchSpools(w.target.value)}
          />`:u}
    ${h.length?c`<div
          class="inv-list ${h.length>3?"many":""}"
          role="radiogroup"
          aria-label=${s(r,"inv_choose")}
          @keydown=${Xa(n)}
          @focusout=${I}
        >
          ${p.map(([w,k])=>c`<div class="inv-group" aria-hidden="true">${w}</div>
                ${k.map(x=>Qa(t,e,n,x,x.id===g,a))}`)}
        </div>`:D(s(r,"inv_no_hit"))}
    ${m?D(s(r,"inv_takes_from",{where:m})):u}
    ${i.empty?D(s(r,"inv_empty_slot")):u}
  </div>`}function tl(t,e,n){let{hass:i}=t,r=L(i,e.entityId),o=r.inventory,a=Zt(i,e),d=r.assignable&&!e.rfid&&!e.inventoryOnly?Va(i,e,n):u;return c`<h2 id="dlg-title">${e.title}</h2>
    ${Na(t,e)} ${d} ${o?Ia(t,o):u}
    ${a?Ka(t,e,n,r):nl(t,e,n,o)}`}function nl(t,e,n,i){let{hass:r}=t;if(e.rfid)return c`<p>${s(r,i?"filament_rfid_linked":"filament_rfid")}</p>
      ${e.spool&&!i?c`<p class="rfid-spool">${e.spool}</p>`:u}
      ${jn(t,e,n)}`;if(ho(e))return c`${D(s(r,e.offer==="failed"?"offer_failed":"offer_empty"))}
      ${jn(t,e,n)}`;let o=po.map(p=>({color:p.color,label:s(r,p.name)})),a=e.custom?{color:e.custom,label:s(r,e.custom===e.current?"color_current":"color_chosen")}:void 0,d=Math.max(0,[...o,...a?[a]:[]].findIndex(p=>p.color===e.color)),l=p=>n.pickColor(p.target.value);return c`${i?D(s(r,"inv_note_change")):u}
    <div class="fil-head">
      <span class="fil-title">${s(r,"profile_title")}</span>
      <span class="fil-help">${s(r,"profile_help")}</span>
    </div>
    ${Fa(r,e,n)}
    <div class="colors">
      <span class="field-label">${s(r,"color")}</span>
      <div class="palette" role="radiogroup" aria-label=${s(r,"color")} @keydown=${Ba}>
        <div class="swatches">${o.map((p,h)=>ao(e,n,p.color,p.label,h===d))}</div>
        <div class="other-row">
          ${a?ao(e,n,a.color,a.label,d===o.length):u}
          <label class="btn plain other-color"
            >${b("palette")}<span>${s(r,"color_other")}</span
            ><input type="color" .value=${(e.color??e.custom??"#FFFFFF").toLowerCase()} @input=${l} @change=${l}
          /></label>
        </div>
      </div>
    </div>
    ${Oa(r,e,n)}
    ${e.offer==="failed"?D(s(r,"offer_failed")):u}
    ${jn(t,e,n)}`}function il(t,e){let{hass:n}=t;switch(e.kind){case"confirm":return{keep:e.keep??s(n,"cancel"),confirm:e.confirm,danger:e.danger===!0,ready:!0};case"drying":return{keep:s(n,"cancel"),confirm:s(n,"dry_start"),danger:!1,ready:!0};case"filament":return Zt(t.hass,e)?sl(t,e):e.rfid||ho(e)?{keep:s(n,"dismiss"),danger:!1,ready:!1}:{keep:s(n,"cancel"),confirm:s(n,"filament_set"),danger:!1,ready:(Kt(e)||ie(e)!==void 0)&&Object.keys(Wt(e)).length>0,...!uo(e)&&!Kt(e)&&ie(e)===void 0&&(e.vendor!==void 0||e.color!==void 0||e.kprofile!==void 0)?{need:s(n,"filament_need_filament")}:{},...mo(rl(t,e),ol(t,e).warn)};case"hms":return{keep:s(n,"dismiss"),...In(t)?{confirm:s(n,"hms_clear")}:{},danger:!1,ready:!0,quiet:Nn(t)};case"firmware":case"info":case"storage":case"maintenance":case"power":case"auto_off":case"camera":return{keep:s(n,"dismiss"),danger:!1,ready:!1};case"check":return{keep:s(n,"dismiss"),...e.running?{}:{confirm:s(n,"check_again")},danger:!1,ready:!e.running};case"skip":{if(!e.loading&&(e.error||e.objects.length<=1))return{keep:s(n,"dismiss"),danger:!0,ready:!1};let i=e.chosen.length,r=i===0?s(n,"skip"):i===1?s(n,"skip_one"):s(n,"skip_many",{count:i});return{keep:s(n,"cancel"),confirm:r,danger:!0,ready:i>0&&!fo(e)}}}}function rl(t,e){let n=L(t.hass,e.entityId);if(!(!t.running||!n.active||Object.keys(Wt(e)).length===0))return s(t.hass,"filament_mid_print",{printer:K(t)})}var mo=(...t)=>{let e=t.filter(n=>n!==void 0);return e.length?{warn:e}:{}};function ol(t,e){let n=L(t.hass,e.entityId),i=n.inventory,r=ie(e),o=e.color!==void 0&&e.color!==e.current||r!==void 0;if(!i||!i.assignedType||!o)return{};let a=e.color??e.current??"",d=(r?.type??n.type).toUpperCase();return co(a,i.assignedColor)&&d===i.assignedType.toUpperCase()||co(a,i.rgba??"FFFFFFFF")&&i.spoolTypes.includes(d)?{}:{warn:s(t.hass,"inv_warn_change",{name:i.name})}}function co(t,e){let n=o=>{let a=o.replace(/^#/,"");return/^[0-9a-f]{6}/i.test(a)?[0,2,4].map(d=>parseInt(a.slice(d,d+2),16)):void 0},[i,r]=[n(t),n(e)];return!i||!r?!1:Math.hypot(i[0]-r[0],i[1]-r[1],i[2]-r[2])<=50}function sl(t,e){let{hass:n}=t,i=L(n,e.entityId);if(!i.assignable)return{keep:s(n,"dismiss"),danger:!1,ready:!1};let r=typeof e.spools=="object"?e.spools:void 0,o=i.inventory?.id,a=r?.spools.find(p=>p.id===e.chosenSpool),d=Ja(t,i),l=a!==void 0&&a.id!==o&&a.fits===void 0&&d===void 0;return{keep:s(n,"cancel"),confirm:s(n,"inv_assign"),danger:!1,ready:l,...d&&a!==void 0&&a.id!==o?{need:d}:{},...o!==void 0?{unassign:s(n,"inv_unassign")}:{},...a!==void 0&&a.id!==o?mo(al(t,i,a).warn):{}}}function al(t,e,n){let i=e.type.toUpperCase();if(e.empty||!i||!n.type)return{};if(i===n.type||i.startsWith(`${n.type}-`))return{};let o={material:n.type,slot:e.type,printer:K(t)};return{warn:s(t.hass,t.running&&e.active?"inv_warn_material_printing":"inv_warn_material",o)}}function ll(t,e,n){let{hass:i}=t;switch(e.kind){case"confirm":return c`<h2 id="dlg-title">${e.title}</h2>
        <p id="dlg-text">${e.text}</p>
        ${e.note?D(e.note,e.noteTone,"dlg-note"):u}`;case"drying":return Ra(i,e,n);case"filament":return tl(t,e,n);case"skip":return Ma(i,e,n);case"hms":return eo(t);case"firmware":return no(t,n.close);case"info":return ro(t,e.copied===!0,n.copy);case"storage":return to(t);case"power":return Nr(t);case"auto_off":return Vr(t);case"camera":return dl(t);case"maintenance":return Lr(t,e,n);case"check":return cr(t,e,n,n.now())}}function dl(t){let{hass:e,refs:n}=t,i=n.cameraFps,r=e.states[i]?.attributes??{},o=(f,g)=>typeof f=="number"?f:g,a=t.targetOf(i),d=o(r.min,5),l=o(r.max,Math.max(d,a??d)),p=o(r.step,5),h=a??l;return c`<h2 id="dlg-title">${s(e,"fps_title")}</h2>
    ${wt({centered:!0,lower:{label:s(e,"fps_lower",{step:p}),disabled:h<=d,onClick:()=>t.stepTarget(i,Math.max(d,h-p))},raise:{label:s(e,"fps_raise",{step:p}),disabled:h>=l,onClick:()=>t.stepTarget(i,Math.min(l,h+p))},value:c`<span aria-hidden="true">${s(e,"fps_value",{fps:h})}</span><span class="sr-only">${s(e,"fps_aria",{fps:h})}</span>`})}
    <p class="hint">${s(e,"fps_note",{min:d,max:l,step:p})}</p>`}var Un=new WeakSet;function go(t,e,n,i=u){let{keep:r,confirm:o,danger:a,ready:d,need:l,quiet:p,unassign:h,warn:f}=il(t,e),g=w=>{let k=w.currentTarget;w.target===k?Un.add(k):Un.delete(k)},_=w=>{let k=w.currentTarget;Un.delete(k)&&w.target===k&&n.close()},m=e.kind==="confirm",y=m?e.note?"dlg-text dlg-note":"dlg-text":void 0;return c`<dialog
    role=${m&&a?"alertdialog":u}
    aria-labelledby="dlg-title"
    aria-describedby=${y??u}
    @cancel=${n.cancel}
    @close=${n.close}
    @pointerdown=${g}
    @click=${_}
  >
    <div class="dlg-body">
      ${ll(t,e,n)}
      ${i}
      <div class="dlg-actions">
        ${(f??[]).map(w=>c`<span class="dlg-warn">${b("warning")}<span>${w}</span></span>`)}
        ${l?c`<span class="dlg-need">${l}</span>`:u}
        ${h?c`<button class="btn plain inv-unassign" @click=${n.unassign}>${h}</button>`:u}
        <button class="btn plain safe" autofocus @click=${n.close}>${r}</button>
        ${o===void 0?u:c`<button class="btn ${a?"danger":p?"tonal":"primary"}" ?disabled=${!d} @click=${n.confirm}>${o}</button>`}
      </div>
    </div>
  </dialog>`}var cl=["load_title_left","load_title_right"],pl=["filament_title_left","filament_title_right"],ul=["edit_external_left","edit_external_right"];function hl(t,e,n,i){let r=!e.present||t.running&&e.active&&e.rfid;return!t.canControl||!t.online||r&&(e.rfid||!e.inventory&&!e.assignable)?u:$({label:i,iconName:"pencil",iconOnly:!0,kind:"plain",className:"edit",disabled:t.changing,pending:t.isPending(`filament_${e.entityId}`),onClick:()=>t.setFilament(e,n,r)})}function _o(t,e,n){let{hass:i,refs:r}=t,o=e.unknown?"\u2014":e.empty?ut(i,e):e.name||e.type,a=e.name.toLowerCase().includes(e.type.toLowerCase()),d=e.active?c`<span class="in-use">${s(i,"in_use")}</span>`:void 0,l=e.inventory,p=l?e.empty?[]:[n.side??"",vn(i,l)].filter(Boolean):[n.side??"",e.empty||!e.name||a?"":e.type,e.empty||e.remaining===void 0?"":z(i,e.remaining)].filter(Boolean),h=l&&e.empty?s(i,"inv_waiting"):void 0,f=l?"\xA0\xB7 ":" \xB7 ",g=t.status==="paused"?{note:s(i,"paused_change")}:{},_=u;return t.canControl&&e.active?_=$({label:s(i,"unload"),iconName:"unload",disabled:!n.canAct,pending:t.isPending("unload"),onClick:()=>t.confirm({title:s(i,"unload_title"),text:s(i,n.nozzle?n.nozzle==="left"?"unload_text_left":"unload_text_right":"unload_text"),confirm:s(i,"unload"),...g,action:["bambuddy","unload_filament",{device_id:r.deviceId}],key:"unload"})}):t.canControl&&!e.empty&&!e.unknown&&n.canLoad&&(_=$({label:s(i,"load"),aria:n.loadName,iconName:"load",disabled:!n.canAct,pending:t.isPending(`load_${e.entityId}`),onClick:()=>t.confirm({title:n.loadTitle(o),text:s(i,n.nozzle?n.nozzle==="left"?"load_text_left":"load_text_right":"load_text"),confirm:s(i,"load"),...g,action:["bambuddy","load_filament",{entity_id:e.entityId}],key:`load_${e.entityId}`})})),c`<div class="slot ${e.active?"active":""}">
    <button
      class="slot-main"
      aria-label=${s(i,"slot_named",{shown:[e.unknown?s(i,"unknown"):o,...l?[l.name]:[],...h?[h]:[],...e.active?[s(i,"in_use")]:[],...p].join(" \xB7 "),place:n.place})}
      @click=${()=>t.moreInfo(e.entityId)}
    >
      ${We(e,"large")}
      <span class="slot-text">
        <span class="slot-name">${o}</span>
        ${l?c`<span class="slot-sub">${l.name}</span>`:u}
        ${h?c`<span class="slot-sub">${h}</span>`:u}
        ${p.length||d?c`<span class="slot-sub">${d}${d&&p.length?f:""}${p.join(f)}</span>`:u}
      </span>
    </button>
    ${hl(t,e,n.title,n.editLabel??s(i,"set_filament"))} ${_}
  </div>`}var fl=["AMS 2 Pro","AMS HT"];function ml(t,e){let{hass:n}=t;if(!e.drying||!fl.includes(e.model))return u;let i=v(n,e.drying)?.state==="on",r=ve(n,e.dryingRemaining),o=r?q(n,r).replace(/ /g,"\xA0"):void 0,a=v(n,e.drying)?.attributes.target_temperature,d=i&&typeof a=="number"&&a>0?H(n,a):void 0,l=R(n,e.drying)?i?d?o?s(n,"drying_at",{temperature:d,time:o}):s(n,"drying_now_at",{temperature:d}):o?s(n,"drying",{time:o}):s(n,"drying_now"):s(n,"not_drying"):"\u2014",p=`dry_${e.deviceId}`,h=v(n,e.drying)?.attributes.remote_start!==!1,f=()=>t.confirm({title:s(n,"dry_stop_title"),text:o?s(n,"dry_stop_text",{unit:e.name,time:o}):s(n,"dry_stop_now",{unit:e.name}),confirm:s(n,"dry_stop"),keep:s(n,"dry_keep"),action:["bambuddy","stop_drying",{device_id:e.deviceId}],key:p});return c`<div class="drying ${i?"on":""}">
    ${b("heat")}<span class="drying-text">${l}</span>
    ${t.canControl&&!h?c`<span class="dry-where">${s(n,"dry_at_printer")}</span>`:u}
    ${t.canControl&&h?$({kind:"plain",disabled:!t.online||!i&&t.changing,pending:t.isPending(p),...i?{label:s(n,"dry_stop"),aria:s(n,"dry_stop_named",{unit:e.name}),iconName:"stop",onClick:f}:{label:s(n,"dry"),aria:s(n,"dry_named",{unit:e.name}),iconName:"heat",onClick:()=>t.dry(e)}}):u}
  </div>`}function gl(t,e,n){let{hass:i}=t,r=S(i,e.humidity),o=S(i,e.temperature),a=e.model===pe,d=yt(t.ams,e),l=xt(i,e),p=t.amsUnfolded(e),h=`slots-${e.deviceId}`;return c`<section class="unit ${p?"open":"folded"}">
    <button
      class="unit-head"
      aria-expanded=${p?"true":"false"}
      aria-controls=${p?h:u}
      @click=${()=>t.toggleAms(e,!p)}
    >
      <span class="unit-title">
        <span class="unit-name">${e.name}</span>
        ${d?c`<span class="unit-model">${d}</span>`:u}
        ${l?c`<span class="unit-nozzle" title=${s(i,l==="left"?"nozzle_left":"nozzle_right")}
              >${b("nozzle")}<span aria-hidden="true">${s(i,l==="left"?"side_left_short":"side_right_short")}</span
              ><span class="sr-only">${s(i,l==="left"?"nozzle_left":"nozzle_right")}</span></span
            >`:u}
        <span class="unit-end">
        <span class="unit-env">
          ${r!==void 0?c`<span title=${s(i,"humidity")}
                ><span class="sr-only">${s(i,"strip_humidity",{humidity:z(i,r)})}</span
                ><span aria-hidden="true">${b("humidity")}${z(i,r)}</span></span
              >`:u}
          ${o!==void 0?c`<span title=${s(i,"temperature")}
                ><span class="sr-only">${s(i,"strip_temperature",{temperature:N(i,e.temperature,o)})}</span
                ><span aria-hidden="true">${b("chamber")}${N(i,e.temperature,o)}</span></span
              >`:u}
        </span>
        <span class="unit-fold">${b("chevronDown")}</span>
        </span>
      </span>
      ${p?u:c`<span class="unit-colors">${e.slots.map(f=>We(L(i,f)))}</span>`}
    </button>
    ${ml(t,e)}
    ${p?c`<div class="slots" id=${h} role="region" aria-label=${e.name}>
            ${e.slots.map((f,g)=>{let _=$t(i,e,f,g);return _o(t,L(i,f),{canAct:n,canLoad:!a,title:s(i,"filament_title",{slot:_}),loadTitle:m=>s(i,"load_title_from",{filament:m,place:_}),loadName:s(i,"load_from",{place:_}),place:_,editLabel:s(i,"edit_slot",{slot:_}),...l?{nozzle:l}:{}})})}
          </div>
          ${a&&t.canControl?c`<p class="hint">${s(i,"ht_load")}</p>`:u}`:u}
  </section>`}var _l=new Set(["paused_by_user","paused_filament_runout","paused_by_gcode"]);function bl(t){if(!t.online||t.status!=="paused"||!t.canControl||t.changing)return u;let e=v(t.hass,t.refs.stage)?.state,n=!!e?.startsWith("paused_")&&!_l.has(e);return Se(s(t.hass,n?"filament_paused_fault":"filament_paused"),t.refs.resume?_t(t):u)}function wl(t){let{hass:e,refs:n}=t,i=n.filamentBackup,r=v(e,i);if(!i||!r||!t.ams.length)return u;let o=s(e,"backup"),a=r.state==="on"||r.state==="off",d=c`<span class="det-text">
    <span class="det-name">${o}</span>
    <span class="det-sub" id="backup-sub">${s(e,"backup_sub")}</span>
    ${n.dual?c`<span class="det-sub">${s(e,"backup_dual")}</span>`:u}
    ${a?u:c`<span class="det-sub" id="backup-unknown">${s(e,"backup_unknown")}</span>`}
  </span>`,l=t.isPending(`switch_${i}`),p=!t.online||r.state==="unavailable",h;if(!t.canControl)h=c`<span class="det-state">${s(e,r.state==="on"?"on":r.state==="off"?"off":"unknown")}</span>`;else if(a){let g=t.switchOn(i);h=c`<button
      class="det-switch"
      role="switch"
      aria-label=${o}
      aria-describedby="backup-sub"
      aria-checked=${g?"true":"false"}
      aria-busy=${l?"true":"false"}
      aria-disabled=${l?"true":u}
      ?disabled=${p}
      @click=${()=>t.toggleSwitch(i)}
    >
      <span class="toggle" aria-hidden="true"><span class="knob"></span></span>
    </button>`}else h=c`<span class="det-state">${s(e,"unknown")}</span>
      <div class="backup-set" role="group" aria-label=${o} aria-describedby="backup-sub backup-unknown">
        ${["off","on"].map(g=>c`<button
            class="btn tonal ${l?"pending":""}"
            ?disabled=${p}
            aria-busy=${l?"true":"false"}
            aria-disabled=${l?"true":u}
            @click=${l?u:()=>t.run(`switch_${i}`,"switch",g==="on"?"turn_on":"turn_off",{entity_id:i})}
          >
            ${s(e,g==="on"?"backup_turn_on":"backup_turn_off")}
          </button>`)}
      </div>`;let f=t.canControl&&!a;return c`<section class="backup"><div class="det-row ${f?"choosing":""}">${d}${h}</div></section>`}function Jn(t){let{hass:e,refs:n}=t,i=!t.canControl||!t.online?void 0:t.running?["filament_pause","warning"]:t.changing?[t.status==="paused"?"changing_paused":"changing_reason","info"]:void 0,r=t.canControl&&t.online&&!t.running&&!t.changing,o=n.externalSpools.length>1,a=Ct(t),d=kt(t);return c`${ue(t)}${i?E(s(e,i[0]),i[1]):u}${bl(t)}
    ${d?c`<div class="activity" role="status">
          ${b("sync")}<span class="sr-only">${K(t)}: </span><span>${d}</span><span class="activity-bar" aria-hidden="true"></span>
        </div>`:u}
    ${t.ams.map(l=>gl(t,l,r))}
    ${wl(t)}
    ${a.length?c`<section class="unit">
          <div class="unit-head"><span class="unit-name">${s(e,a.length>1?"externals":"external")}</span></div>
          <div class="slots">
            ${a.map(l=>{let p=n.externalSpools.indexOf(l);return _o(t,L(e,l),{canAct:r,canLoad:!0,title:s(e,o?pl[p]:"filament_title_external"),loadTitle:h=>s(e,o?cl[p]:"load_title_external",{filament:h}),loadName:s(e,o?p===0?"load_from_left":"load_from_right":"load_from_external"),place:s(e,o?p===0?"external_left_place":"external_right_place":"external"),editLabel:s(e,o?ul[p]:"edit_external"),...o?{nozzle:p===0?"left":"right"}:{},...o?{side:Ce(e,p)}:{}})})}
          </div>
        </section>`:u}`}var Xn=t=>({allowed:()=>t.join(", "),check:e=>typeof e=="string"&&t.includes(e)}),Qn=t=>({allowed:()=>s(void 0,"allowed_list",{values:t.join(", ")}),check:e=>Array.isArray(e)&&e.every(n=>typeof n=="string"&&t.includes(n))}),Ee={allowed:()=>"true, false",check:t=>typeof t=="boolean"},vl={printer:{allowed:()=>s(void 0,"allowed_device"),check:t=>typeof t=="string"},camera:Xn(Tn),status_blocks:Qn(Ht),header_chips:Qn(An),compact_chips:Ee,start_view:Xn(zn),show_control_tab:Ee,control_sections:Qn(Et),read_only:Ee,show_filament_tab:Ee,ams_folding:Xn(Dn),show_external_spool:Ee,show_auto_off:Ee};function qt(t){if(t===null||typeof t!="object"||Array.isArray(t))throw new Error(s(void 0,"invalid_option",{option:"type",value:JSON.stringify(t),allowed:"custom:bambuddy-printer-card"}));let e=Object.fromEntries(Object.entries(t).filter(([,n])=>n!==null).map(([n,i])=>[n,Array.isArray(i)?[...new Set(i)]:n==="camera"&&i===!1?"off":i]));for(let[n,i]of Object.entries(vl)){let r=e[n];if(r!==void 0&&!i.check(r))throw new Error(s(void 0,"invalid_option",{option:n,value:JSON.stringify(r),allowed:i.allowed()}))}return e}var C={camera:"tap",blocks:Ht,chips:pr,startView:"status",controlTab:!0,sections:Et,readOnly:!1,filamentTab:!0,amsFolding:"auto",externalSpool:!0,showAutoOff:!0,compactChips:!1},vo=t=>({camera:t.camera??C.camera,blocks:t.status_blocks??C.blocks,chips:t.header_chips??C.chips,startView:t.start_view??C.startView,controlTab:t.show_control_tab??C.controlTab,sections:t.control_sections??C.sections,readOnly:t.read_only??C.readOnly,filamentTab:t.show_filament_tab??C.filamentTab,amsFolding:t.ams_folding??C.amsFolding,externalSpool:t.show_external_spool??C.externalSpool,showAutoOff:t.show_auto_off??C.showAutoOff,compactChips:t.compact_chips??C.compactChips}),yo=t=>({...Object.fromEntries(Object.entries(ni).map(([e,n])=>[e,Array.isArray(n)?[...n]:n])),...t}),ni={camera:C.camera,status_blocks:C.blocks,header_chips:C.chips,start_view:C.startView,show_control_tab:C.controlTab,control_sections:C.sections,read_only:C.readOnly,show_filament_tab:C.filamentTab,ams_folding:C.amsFolding,show_external_spool:C.externalSpool,show_auto_off:C.showAutoOff,compact_chips:C.compactChips};function xo(t,e,n){let i={...t};for(let r of new Set([...Object.keys(e),...Object.keys(n)]))JSON.stringify(n[r])!==JSON.stringify(e[r])&&(n[r]===void 0||r in ni&&JSON.stringify(n[r])===JSON.stringify(ni[r])?delete i[r]:i[r]=n[r]);return i}var bo={printer:"editor_printer",camera:"editor_camera",status_blocks:"editor_blocks",header_chips:"editor_chips",start_view:"editor_start_view",show_control_tab:"editor_control_tab",control_sections:"editor_sections",read_only:"editor_read_only",show_filament_tab:"editor_filament_tab",ams_folding:"editor_ams_folding",show_external_spool:"editor_external_spool",show_auto_off:"editor_show_auto_off",compact_chips:"editor_compact_chips"},wo={printer:"editor_printer_help",camera:"editor_camera_help",status_blocks:"editor_blocks_help",header_chips:"editor_chips_help",show_control_tab:"editor_control_tab_help",control_sections:"editor_sections_help",read_only:"editor_read_only_help",show_filament_tab:"editor_filament_tab_help",ams_folding:"editor_ams_folding_help",show_external_spool:"editor_external_spool_help",show_auto_off:"editor_show_auto_off_help",compact_chips:"editor_compact_chips_help"};function ko(t,e){let n=e.start_view,i=e.control_sections,r=Array.isArray(i)&&i.every(d=>d==="motion"),o=e.show_control_tab===!1||Array.isArray(i)&&!i.length||e.read_only===!0&&r;return n==="control"&&o||n==="filament"&&e.show_filament_tab===!1?s(t,"editor_start_hidden",{tab:s(t,`tab_${n}`)}):void 0}var $o=(t,e,n)=>n.map(i=>({value:i,label:s(t,`${e}_${i}`)})),ei=(t,e,n,i)=>({name:e,required:!0,selector:{select:{mode:"dropdown",options:$o(t,n,i)}}}),ti=(t,e,n,i)=>({name:e,selector:{select:{multiple:!0,reorder:!0,options:$o(t,n,i)}}}),Re=t=>({name:t,selector:{boolean:{}}}),Gt=(t,e,n,i)=>({name:"",type:"expandable",title:s(t,e),icon:n,schema:i});function So(t){return{schema:[{name:"printer",required:!0,selector:{device:{filter:{integration:"bambuddy"},entity:{integration:"bambuddy",domain:"sensor",device_class:"enum"}}}},Gt(t,"editor_group_general","mdi:cog-outline",[ei(t,"start_view","tab",zn),ei(t,"camera","camera",Tn),ti(t,"header_chips","chip",An),Re("compact_chips"),Re("read_only")]),Gt(t,"editor_group_status","mdi:printer-3d",[ti(t,"status_blocks","block",Ht),Re("show_auto_off")]),Gt(t,"editor_group_control","mdi:gamepad-round-outline",[Re("show_control_tab"),ti(t,"control_sections","section",Et)]),Gt(t,"editor_group_filament","mdi:printer-3d-nozzle",[Re("show_filament_tab"),ei(t,"ams_folding","folding",Dn),Re("show_external_spool")])],computeLabel:e=>e.name in bo?s(t,bo[e.name]):void 0,computeHelper:e=>e.name in wo?s(t,wo[e.name]):void 0}}var ii="bambuddy-printer-card-editor",Yt="ha-form",yl=5e3;async function Co(t=yl){let e=window.customElements;if(e.get(Yt))return!0;(async()=>{await(await(await window.loadCardHelpers?.())?.createCardElement({type:"button"}))?.constructor?.getConfigElement?.()})().catch(()=>{});let i,r=new Promise(a=>{i=setTimeout(()=>a(!1),t)}),o=await Promise.race([e.whenDefined(Yt).then(()=>!0),r]);return clearTimeout(i),o}var Jt=class extends j{constructor(){super(...arguments);this.formReady=window.customElements.get(Yt)!==void 0;this.helper=n=>(n.name==="start_view"?ko(this.hass,this.shown??{}):void 0)??this.fields().computeHelper(n);this.changed=n=>{let i=n.detail.value,r=xo(this.config,this.shown,i);this.setConfig(r),this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:r},bubbles:!0,composed:!0}))}}static{this.properties={hass:{attribute:!1},shown:{state:!0},formReady:{state:!0}}}static{this.styles=Be`
    .unavailable {
      margin: 0;
      padding: 8px 0;
      color: var(--secondary-text-color);
    }
  `}setConfig(n){this.shown=yo(qt(n)),this.config=n}connectedCallback(){super.connectedCallback(),this.formReady||window.customElements.whenDefined(Yt).then(()=>this.formReady=!0)}fields(){let n=be(this.hass);return this.form?.language!==n&&(this.form={language:n,form:So(this.hass)}),this.form.form}render(){if(!this.shown)return u;if(!this.formReady)return c`<p class="unavailable">${s(this.hass,"editor_unavailable")}</p>`;let{schema:n,computeLabel:i}=this.fields();return c`<ha-form
      .hass=${this.hass}
      .data=${this.shown}
      .schema=${n}
      .computeLabel=${i}
      .computeHelper=${this.helper}
      @value-changed=${this.changed}
    ></ha-form>`}};var xl=window.customElements,kl=1e4;function $l(t=()=>window.customElements,e=xl,n=kl){let i=Date.now();return new Promise(r=>{let o=()=>{let a=t();a!==e||a.get("home-assistant")||Date.now()-i>=n?r(a):setTimeout(o,50)};o()})}var Sl="https://github.com/Spegeli/hacs_bambuddy#-dashboard-card";function Cl(t,e,n){let i=t.entities[e];if(!i||i.platform!==Rt||!i.device_id)return null;let r=t.devices[i.device_id],o=Mt(t,i.device_id)?i.device_id:r?.via_device_id;return!o||!Mt(t,o)?null:{config:{type:`custom:${n}`,printer:o}}}function ri(t,e){$l().then(n=>{n.get(t)||n.define(t,e)})}function To(t,e,n){ri(t,e);let i=window;i.customCards??=[],!i.customCards.some(r=>r.type===t)&&i.customCards.push({type:t,get name(){return n.name()},get description(){return n.description()},preview:!0,documentationURL:Sl,getEntitySuggestion:(r,o)=>Cl(r,o,t)})}function Ao(t){let{hass:e,refs:n}=t;return v(e,n.plateClearNeeded)?.state!=="on"||Y.has(t.status)?u:n.plateCleared?t.canControl?Se(s(e,"plate_text"),$({label:s(e,"plate_cleared"),iconName:"check",kind:"primary",pending:t.isPending("plate"),onClick:()=>t.run("plate","button","press",{entity_id:n.plateCleared})})):Se(s(e,"plate_text_read")):Se(s(e,"plate_text_bambuddy"))}var Tl=new Set(["idle","printing","unknown","unavailable"]),Al={idle:"ready",preparing:"timer",slicing:"timer",printing:"play",paused:"pause",finished:"check",failed:"error"};function oi(t,e){let{hass:n,refs:i,status:r}=t,o=v(n,i.stage)?.state;return(e&&!(r==="finished"||r==="failed")&&o&&!Tl.has(o)?M(n,i.stage):M(n,i.status,r))??r}function zl(t,e){let{status:n}=t;return c`<div class="state tone-${mn(n)}">${b(Al[n]??"infoOutline")}<span>${oi(t,e)}</span></div>`}function si(t,e){let n=Fn(t);if(n)return c`<div class="job">${e}<div class="job-info">${n.info}</div></div>${n.actions}`;let i=c`<div class="offline-actions">${$({label:s(t.hass,"check_connection"),iconName:"lan",onClick:t.checkConnection})}</div>`;return c`<div class="job">${e}<div class="job-info">${E(Wi(t,"offline_text"),"warning")}</div></div>
    ${t.unreachable?u:i}`}function Dl(t,e){let{hass:n,refs:i,status:r}=t,o=mn(r);if(!t.online)return si(t,e);let a=ct.has(r),d=a?M(n,i.job):void 0,l=d===void 0?void 0:pt(d),p=r==="finished"?100:S(n,i.progress),h=[],f=S(n,i.layer),g=S(n,i.totalLayers);a&&f&&g&&h.push(["layers",s(n,"layer",{current:f,total:g})]);let _=ve(n,i.remaining);Y.has(r)&&_&&h.push(["timer",s(n,"remaining",{time:q(n,_)})]);let m=v(n,i.endTime)?.state,y=Y.has(r)&&m?dt(n,m):void 0;y&&h.push(["clock",s(n,"ends",{time:y})]);let w=a&&r!=="failed"&&p!==void 0,k=kt(t);return c`<div class="job">
    ${e}
    <div class="job-info">
      <span class="job-name" title=${l??""}>${l===void 0?s(n,"no_job"):Ll(l)}</span>
      ${zl(t,a)}
      ${k?c`<div class="ams-activity" role="status">${b("sync")}<span class="sr-only">${K(t)}: </span><span>${k}</span></div>`:u}
      ${w?c`<div class="bar-row">
            <div
              class="bar tone-${o}"
              role="progressbar"
              aria-label=${s(n,"progress")}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow=${p}
              aria-valuetext=${z(n,p)}
            >
              <span style="width: ${Math.max(0,Math.min(100,p))}%"></span>
            </div>
            <span class="pct tone-${o}" aria-hidden="true">${z(n,p)}</span>
          </div>`:u}
      ${h.length?c`<div class="meta">${h.map(([x,P])=>c`<span>${b(x)}${P}</span>`)}</div>`:u}
    </div>
  </div>`}function Ll(t){let e=t.split(/(?<=[_-])/);return c`${e.map((n,i)=>i?c`<wbr />${n}`:n)}`}function Hl(t,e,n,i,r=!1){let{hass:o}=t,a=S(o,n.sensor),d=S(o,n.target),l=d!==void 0&&d>ce(o,n.target),p=a===void 0?"\u2014":N(o,n.sensor,a),h=i==="chamber"&&(t.refs.airduct!==void 0||t.refs.ventilation!==void 0),f=h&&!l?Qi(t):void 0,g=l||f?.kind==="warm",_=l?s(o,"target",{value:N(o,n.target,d)}):f?.kind==="warm"?s(o,"keep_warm"):f?.kind==="vent"?s(o,"tile_vent",{value:z(o,f.percent)}):d!==void 0||h?s(o,"heater_off"):void 0;return c`<button
    class="temp ${g?"heating":""} ${f?.kind==="vent"?"venting":""}"
    aria-label=${[r?`${e} ${s(o,"nozzle_active")}`:e,p,_].filter(Boolean).join(", ")}
    @click=${()=>t.moreInfo(t.viewOnly?n.sensor:f?.kind==="vent"?t.refs.ventilation??n.sensor:n.target??n.sensor)}
  >
    <span class="temp-head"
      >${b(g?"heat":f?.kind==="vent"?"fan":i)}<span>${e}</span> ${r?c`<span class="temp-tag">${s(o,"nozzle_active")}</span>`:u}</span
    >
    <span class="temp-value">${p}</span>
    ${_?c`<span class="temp-target">${_}</span>`:u}
  </button>`}function El(t){let e=bt(t).filter(({heater:i})=>i.sensor||i.target);if(!e.length)return u;let n=t.busy?fe(t):void 0;return c`<div class="temps n${e.length} ${t.refs.dual?"dual":""}">
    ${e.map(({label:i,heater:r,kind:o,index:a})=>Hl(t,i,r,o,o==="nozzle"&&a===n))}
  </div>`}function Rl(t,e){let n=v(t.hass,e);if(!n||n.state!=="on"&&n.state!=="off")return;let i=n.attributes.percentage;return n.state==="off"?0:typeof i=="number"?i:100}function Ml(t){let{hass:e,refs:n}=t,i=n.fans.filter(r=>v(e,r.entityId)?.attributes.restored!==!0).map(r=>[r.key,r.entityId,Rl(t,r.entityId)]);return n.hotendFan&&i.push(["hotend",n.hotendFan,S(e,n.hotendFan)]),i.length?c`<div class="fans" role="group" aria-label=${s(e,"fans")}>
    ${i.map(([r,o,a])=>{let d=s(e,`fan_${r}`),l=vt(t,o,`fan_${r}_name`),p=a===void 0?"\u2014":a>0?z(e,a):s(e,"fan_off"),h=c`${b("fan")}<span class="fan-label short">${d}</span><span class="fan-label full">${l}</span><span class="fan-value">${p}</span>`;return t.viewOnly&&r!=="hotend"?c`<span class="fan ${a?"on":""}" role="img" aria-label="${l}: ${p}" title=${l}>${h}</span>`:c`<button class="fan ${a?"on":""}" aria-label="${l}: ${p}" title=${l} @click=${()=>t.moreInfo(o)}>
            ${h}
          </button>`})}
  </div>`:u}var Bl=(t,e)=>t.unknown?"\u2014":t.empty?t.present&&!e?"?":"\u2013":t.type||"?";function Ol(t){let{hass:e,refs:n}=t,i=n.externalSpools.length===2,r=Ct(t),o=[...t.ams.map(m=>{let y=yt(t.ams,m),w=xt(e,m),k=[y,w?s(e,w==="left"?"strip_nozzle_left":"strip_nozzle_right"):void 0].filter(Boolean);return{name:m.name,spoken:k.length?`${m.name} (${k.join(", ")})`:m.name,model:y,nozzle:w,humidity:S(e,m.humidity),temperature:S(e,m.temperature),temperatureUnit:V(e,m.temperature),slots:m.slots,fill:m.model===pe,ht:m.model===pe,sides:!1}}),...r.length?[{name:s(e,"external_short"),spoken:s(e,r.length>1?"externals":"external"),model:void 0,nozzle:void 0,humidity:void 0,temperature:void 0,slots:r,fill:!0,ht:!1,sides:i}]:[]];if(!o.length)return u;let a=o.filter(m=>!m.fill),d=o.filter(m=>m.fill),l=i?[s(e,"side_left_short"),s(e,"side_right_short")]:[],p=m=>l[n.externalSpools.indexOf(m)],h=m=>{let y=L(e,m),w=i?n.externalSpools.indexOf(m):-1;return`${w>=0?`${Ce(e,w)}: `:""}${St(e,y)}${y.active?` \xB7 ${s(e,"in_use")}`:""}`},f=[...a,...d].map(m=>s(e,"strip_unit",{name:[m.spoken,...m.humidity===void 0?[]:[s(e,"strip_humidity",{humidity:z(e,m.humidity)})],...m.temperature===void 0?[]:[s(e,"strip_temperature",{temperature:H(e,m.temperature,m.temperatureUnit)})]].join(", "),slots:m.slots.map(h).join(", ")})),g=m=>c`<span class="ams-group">
        <span class="ams-head">
          <span class="ams-line">
            <span class="ams-name" title=${m.spoken}>${m.name}</span>
            ${m.model?c`<span class="unit-model">${m.model}</span>`:u}
            ${m.nozzle?c`<span class="ams-nozzle" aria-hidden="true" title=${s(e,m.nozzle==="left"?"nozzle_left":"nozzle_right")}
                  >${s(e,m.nozzle==="left"?"side_left_short":"side_right_short")}</span
                >`:u}
          </span>
          ${m.sides?u:c`<span class="ams-env">
                ${m.humidity!==void 0?c`<span class="ams-hum" title=${s(e,"humidity")}>${b("humidity")}${z(e,m.humidity)}</span>`:u}
                ${m.temperature!==void 0?c`<span class="ams-temp" title=${s(e,"temperature")}>${b("chamber")}${H(e,m.temperature,m.temperatureUnit)}</span>`:u}
              </span>`}
        </span>
        <span class="ams-slots">
          ${m.slots.map(y=>{let w=L(e,y),k=p(y);return c`<span class="ams-slot" title=${k?`${k} \xB7 ${St(e,w)}`:St(e,w)}
              >${k?c`<span class="slot-side">${k}</span>`:u}${We(w)}<span class="slot-type"
                >${Bl(w,n.externalSpools.includes(y))}</span
              ></span
            >`})}
        </span>
      </span>`,_=c`<span class="ams-units"
    >${a.length?c`<span class="ams-column" aria-hidden="true">${a.map(g)}</span>`:u}${d.length?c`<span class="ams-fill ${d.some(m=>m.ht)?"with-ht":""}" aria-hidden="true">${d.map(g)}</span>`:u}</span
  >`;return t.filamentTab?c`<button class="ams-strip" aria-label=${`${s(e,"block_ams")} \u2013 ${s(e,"open_filament")}`} aria-describedby="ams-said" @click=${()=>t.show("filament")}>
        <span class="sr-only" id="ams-said">${f.join(". ")}</span>${_}<span class="ams-go">${b("chevronRight")}</span>
      </button>`:c`<div class="ams-strip" role="group" aria-label=${s(e,"block_ams")}><span class="sr-only">${f.join(". ")}</span>${_}</div>`}var Fl=["silent","standard","sport","ludicrous"];function Pl(t){let e=/^(.+?)\s*\(([^)]+)\)\s*$/.exec(t);return e?[e[1],e[2]]:[t]}function Nl(t){let{hass:e,refs:n,status:i}=t,r=v(e,n.speed);if(!r||!t.online||!Y.has(i))return u;if(!t.canControl)return c`<div class="speed">
      <span class="speed-label">${b("speed")}${s(e,"speed")}</span>
      <span class="speed-now">${M(e,n.speed,r.state)??r.state}</span>
    </div>`;let o=xe(r,Fl,!0),a=t.isPending("speed"),d=Q(o,r.state);return c`<div class="speed">
    <span class="speed-label">${b("speed")}${s(e,"speed")}</span>
    <div class="seg speeds" role="radiogroup" aria-label=${s(e,"speed")} @keydown=${J} @focusout=${I}>
      ${o.map((l,p)=>{let h=M(e,n.speed,l),[f,g]=Pl(h);return c`<button
          role="radio"
          aria-checked=${l===r.state?"true":"false"}
          tabindex=${p===d?0:-1}
          aria-label=${h}
          title=${h}
          aria-disabled=${a?"true":u}
          ?disabled=${r.state==="unavailable"}
          @click=${()=>t.run("speed","select","select_option",{entity_id:n.speed,option:l})}
        >
          <span class="opt">${f}</span> ${g?c`<span class="opt-sub">${g}</span>`:u}
        </button>`})}
    </div>
  </div>`}function Vl(t){let{hass:e,refs:n}=t;return n.dual||v(e,n.activeFilament)?.state!=="none"?!1:![...t.ams.flatMap(r=>r.slots),...n.externalSpools].some(r=>L(e,r).active)}function zo(t){let{hass:e,refs:n,status:i}=t;if(!t.online||!Y.has(i))return u;if(!t.canControl)return u;let r=i==="paused",o=[r?n.resume?_t(t):u:n.pause?$({label:s(e,"pause"),iconName:"pause",pending:t.isPending("pause"),onClick:()=>t.run("pause","button","press",{entity_id:n.pause})}):u,n.stop?$({label:s(e,"stop"),iconName:"stop",kind:"danger",pending:t.isPending("stop"),onClick:()=>t.confirm(ht(e,["button","press",{entity_id:n.stop}],"stop"))}):u,i==="printing"||r?$({label:s(e,"skip"),iconName:"skip",kind:"plain",pending:t.isPending("skip"),className:"skip",onClick:t.skip}):u],a=r&&n.resume?t.changing?E(s(e,"changing_paused")):Vl(t)?E(s(e,t.filamentTab?"paused_empty":"paused_empty_no_tab"),"warning"):u:u;return c`<div class="controls">${a}<div class="ctl-buttons">${o}</div></div>`}function Xt(t,e){return e==="controls"?c`${ue(t)}${zo(t)}`:e==="power"?t.unreachable?u:Pr(t):t.online?e==="temperatures"?El(t):e==="fans"?Ml(t):e==="ams"?Ol(t):Nl(t):u}var Il=(t,e)=>e==="power"?Xt(t,e)!==u:t.online&&(e==="controls"||e==="speed"?t.busy:!0);function Kl(t){let e={...je(t),status:"printing",busy:!0,running:!0,changing:!1},n=[],i,r=[],o=()=>{i&&n.push(mt(t,i,r)),i=void 0,r=[]};for(let a of t.settings.blocks){if(Il(t,a)){o(),n.push(Xt(t,a));continue}let d=a==="controls"?ue(t):u;d!==u&&(o(),n.push(d));let l=a==="controls"?zo(e):Xt(e,a);if(l===u)continue;let p=ft(t,a==="controls"||a==="speed");p!==i&&o(),i=p,r.push(l)}return o(),n}function Do(t,e){let n=t.online;return c`${n?Ao(t):u}${Dl(t,e)}${n?u:Ao(t)}
  ${t.examples?Kl(t):t.settings.blocks.map(i=>Xt(t,i))}`}var Lo=Be`
  :host {
    container-type: inline-size;
    display: block;
    --bb-text: var(--primary-text-color, #212121);
    --bb-muted: var(--secondary-text-color, #727272);
    --bb-disabled: var(--disabled-text-color, #9e9e9e);
    --bb-accent: var(--primary-color, #03a9f4);
    /* The focus ring: the accent mixed with the text, 3:1 also on the light theme's tint. */
    --bb-ring: color-mix(in srgb, var(--bb-accent) 80%, var(--bb-text));
    --bb-on-accent: var(--text-primary-color, #fff);
    --bb-ok: var(--success-color, #43a047);
    --bb-warn: var(--warning-color, #ffa600);
    --bb-err: var(--error-color, #db4437);
    --bb-info: var(--info-color, #039be5);
    /* The disc of what sits on the camera's picture: a medium grey that
       reads apart from black and keeps a white glyph clear on a bright
       picture -- the same in the card and in full screen. */
    --bb-on-picture: rgba(72, 72, 72, 0.78);
    --bb-divider: var(--divider-color, rgba(0, 0, 0, 0.12));
    /* From the text colour itself: Home Assistant computes its rgb triple
       only from a theme's own hex value, not from one it names by a variable. */
    --bb-tint: color-mix(in srgb, var(--bb-text) 5%, transparent);
    --bb-tint-2: color-mix(in srgb, var(--bb-text) 9%, transparent);
    --bb-line: color-mix(in srgb, var(--bb-text) 16%, transparent);
    --bb-heat: var(--deep-orange-color, #ff6f22);
  }
  ha-card {
    display: block;
    position: relative;
    color: var(--bb-text);
    font-family: var(--ha-font-family-body, inherit);
    /* Where the chips and the HMS line start: the card's padding, as the
       tabs and the blocks below -- one left edge under the head. */
    --bb-inset: 16px;
  }
  .tone-active {
    --tone: var(--bb-accent);
  }
  .tone-paused {
    --tone: var(--bb-warn);
  }
  .tone-done {
    --tone: var(--bb-ok);
  }
  .tone-failed {
    --tone: var(--bb-err);
  }
  .tone-idle {
    --tone: var(--bb-muted);
  }
  .tone-off {
    --tone: var(--bb-disabled);
  }
  /* The head's chips: good, needs a look, a problem, to know, nothing to say. */
  .tone-ok {
    --tone: var(--bb-ok);
  }
  .tone-warn {
    --tone: var(--bb-warn);
  }
  .tone-err {
    --tone: var(--bb-err);
  }
  .tone-info {
    --tone: var(--bb-info);
  }
  .tone-neutral {
    --tone: var(--bb-muted);
  }
  .icon {
    width: 18px;
    height: 18px;
    fill: currentColor;
    flex: none;
  }
  button {
    font: inherit;
    color: inherit;
  }
  button:focus-visible {
    outline: 2px solid var(--bb-ring);
    outline-offset: 2px;
  }

  /* Header: online dot, name, light, menu; the chips below. */
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px 10px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
    background: var(--bb-disabled);
  }
  .dot.on {
    background: var(--bb-ok);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--bb-ok) 22%, transparent);
  }
  .names {
    flex: 1;
    min-width: 0;
  }
  /* A long name wraps to a second line before it is cut. */
  .name {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: 16px;
    font-weight: 500;
    line-height: 22px;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  /* Never cut: two nozzles and the hours take a second line on a narrow card. */
  .model {
    font-size: 12px;
    color: var(--bb-muted);
    line-height: 16px;
    overflow-wrap: anywhere;
  }
  /* Network, HMS, firmware: small chips that wrap; the icon carries the
     colour, the text stays readable. */
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: -2px var(--bb-inset) 10px;
  }
  .pill {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 26px;
    padding: 0 10px 0 8px;
    border: 0;
    border-radius: 13px;
    font-size: 12px;
    font-weight: 500;
    line-height: 16px;
    /* Never cut: more chips take more rows, and a chip wider than a narrow
       card wraps its words. */
    white-space: normal;
    text-align: start;
    color: var(--bb-text);
    background: color-mix(in srgb, var(--tone) 13%, transparent);
    font-variant-numeric: tabular-nums;
  }
  /* A compact chip of its icon alone: the icon in the middle. */
  .pill.icon-only {
    padding: 0 9px;
  }
  button.pill {
    cursor: pointer;
  }
  button.pill:hover {
    background: color-mix(in srgb, var(--tone) 20%, transparent);
  }
  .pill .icon {
    width: 15px;
    height: 15px;
    color: var(--tone);
  }
  /* The drying chip: what dries, then its time in bold; where the row is
     too narrow, the time wraps whole onto a line of its own. */
  .dry-chip .dry-text {
    display: inline-flex;
    flex-wrap: wrap;
    column-gap: 5px;
  }
  .dry-chip .dry-text > span {
    white-space: nowrap;
  }
  .dry-chip .dry-time {
    font-weight: 700;
  }
  .pill.tone-neutral {
    background: var(--bb-tint);
  }
  .pill.tone-neutral .icon {
    color: var(--bb-muted);
  }
  button.pill.tone-neutral:hover {
    background: var(--bb-tint-2);
  }
  /* On a touch screen a chip takes a tap 32 px high: the 6 px between two
     rows are shared, nothing looks bigger. */
  @media (pointer: coarse) {
    button.pill::before {
      content: "";
      position: absolute;
      inset: -3px 0;
    }
  }
  /* The HMS line: the message that matters, in its severity's colour, cut
     to one line; a tap opens the messages. */
  .hms-line {
    display: flex;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    width: calc(100% - 2 * var(--bb-inset));
    min-height: 32px;
    margin: -4px var(--bb-inset) 10px;
    padding: 0 6px 0 8px;
    border: 0;
    border-radius: 8px;
    font-size: 13px;
    line-height: 18px;
    text-align: left;
    color: var(--bb-text);
    background: color-mix(in srgb, var(--tone) 13%, transparent);
    cursor: pointer;
  }
  .hms-line:hover {
    background: color-mix(in srgb, var(--tone) 20%, transparent);
  }
  .hms-line > .icon {
    width: 16px;
    height: 16px;
    color: var(--tone);
  }
  .hms-line-text {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .hms-line-more {
    flex: none;
    white-space: nowrap;
    color: var(--bb-muted);
  }
  .hms-line-go {
    display: inline-flex;
    flex: none;
    margin-left: auto;
    color: var(--bb-muted);
  }
  /* The menu: a small popover below the three dots. */
  .menu-wrap {
    position: relative;
    flex: none;
    margin-right: -6px;
  }
  .menu-btn[aria-expanded="true"] {
    background: var(--bb-tint-2);
  }
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 3;
    min-width: 200px;
    max-width: min(280px, calc(100vw - 32px));
    padding: 6px 0;
    border-radius: 12px;
    background: var(--ha-card-background, var(--card-background-color, #fff));
    box-shadow:
      0 0 0 1px var(--bb-divider),
      0 8px 24px rgba(0, 0, 0, 0.2);
    animation: menu-in 0.12s ease-out;
  }
  .menu [role="menuitem"] {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 44px;
    padding: 0 16px;
    border: 0;
    background: none;
    font-size: 14px;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }
  .menu [role="menuitem"] .icon {
    color: var(--bb-muted);
  }
  .menu [role="menuitem"]:hover {
    background: var(--bb-tint);
  }
  /* The keyboard's place: the card's ring, inside the item. */
  .menu [role="menuitem"]:focus-visible {
    background: var(--bb-tint);
    outline: 2px solid var(--bb-ring);
    outline-offset: -2px;
  }
  .menu [role="menuitem"]:disabled {
    cursor: default;
    opacity: 0.4;
  }
  @keyframes menu-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  .chip {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    color: color-mix(in srgb, var(--tone) 45%, var(--bb-text));
    background: color-mix(in srgb, var(--tone) 15%, transparent);
  }
  .chip.tone-off {
    --tone: var(--bb-muted);
  }
  .icon-btn {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 50%;
    padding: 0;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--bb-tint);
    color: var(--bb-muted);
    cursor: pointer;
  }
  .icon-btn .icon {
    width: 20px;
    height: 20px;
  }
  /* With Hide controls: the light's state, nothing to tap. */
  span.icon-btn {
    cursor: default;
  }
  .icon-btn.light.on {
    color: var(--amber-color, #ffb300);
    background: color-mix(in srgb, var(--amber-color, #ffb300) 18%, transparent);
  }

  /* Views. */
  .tabs {
    display: flex;
    gap: 4px;
    margin: 0 16px 4px;
    padding: 3px;
    border-radius: 12px;
    background: var(--bb-tint);
  }
  .tabs button {
    flex: 1;
    border: 0;
    border-radius: 9px;
    padding: 6px 4px;
    background: none;
    color: var(--bb-muted);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }
  .tabs button[aria-selected="true"] {
    background: var(--ha-card-background, var(--card-background-color, #fff));
    color: var(--bb-text);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14);
  }
  /* A tab's icon shows only on a card too narrow for its name. */
  .tabs .tab-icon {
    display: none;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 10px 16px 16px;
  }
  .message {
    padding: 16px;
    color: var(--bb-muted);
  }

  /* Buttons. Their text mixes the accent with the text colour, as the
     state line does: 4.5:1 on their tints, light and dark. */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 14px;
    border: 0;
    border-radius: 18px;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    color: color-mix(in srgb, var(--bb-accent) 50%, var(--bb-text));
    background: color-mix(in srgb, var(--bb-accent) 14%, transparent);
    transition: opacity 0.15s;
  }
  .btn.primary {
    color: var(--bb-on-accent);
    background: var(--bb-accent);
  }
  .btn.danger {
    color: color-mix(in srgb, var(--bb-err) 70%, var(--bb-text));
    background: color-mix(in srgb, var(--bb-err) 13%, transparent);
  }
  .btn.plain {
    background: none;
    padding: 0 8px;
  }
  .btn:disabled {
    cursor: default;
    opacity: 0.4;
  }
  .btn.pending {
    opacity: 0.65;
    cursor: progress;
  }
  .icon-btn.pending {
    cursor: progress;
  }
  /* On its way: the icon turns into a small spinner. */
  .btn.pending > .icon,
  .icon-btn.pending > .icon {
    box-sizing: border-box;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  .btn.pending > .icon path,
  .icon-btn.pending > .icon path {
    display: none;
  }
  .btn.icon-only {
    padding: 0;
    width: 36px;
  }

  /* The card editor's preview: parts with nothing to show now, as examples. */
  .sample {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .sample-note {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--bb-muted);
  }
  .sample-note .icon {
    flex: none;
    width: 14px;
    height: 14px;
  }
  .sample-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    opacity: 0.55;
    pointer-events: none;
  }

  /* The offline view's actions: check the connection, the plug; on a
     narrow card the second goes below the first, a long label wraps. */
  .offline-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .offline-actions .btn {
    max-width: 100%;
    white-space: normal;
  }
  /* Keeping a P2S's chamber warm: off and on, each wide enough for its word. */
  .keep-warm .seg button {
    min-width: 52px;
    white-space: nowrap;
  }
  /* „Lüften“ under the heaters: its own head and row. */
  .vent-part {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 12px;
  }
  /* The AMS filament backup: a setting between the AMS units and the
     external spool. */
  .backup {
    border-top: 1px solid var(--bb-divider);
  }
  .backup + .unit {
    border-top: 1px solid var(--bb-divider);
    padding-top: 12px;
  }
  /* Unknown: the choice on a line of its own, outlined -- nothing chosen. */
  .backup .det-row.choosing {
    flex-wrap: wrap;
    padding-bottom: 8px;
  }
  .backup .det-row.choosing .det-text {
    flex: 1 1 0;
  }
  .backup .backup-set {
    flex: 1 0 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  /* The plugs: one tinted box, a row per plug -- icon, name and what it
     reports, its switch on the right --; the switch-off after the print
     indented under the printer's plug. */
  .power {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .power-box {
    display: flex;
    flex-direction: column;
    padding: 4px 12px;
    border-radius: 10px;
    background: var(--bb-tint);
  }
  .p-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 6px 0;
  }
  .power-box > .p-row:not(.p-auto) + .p-row:not(.p-auto),
  .power-box > .p-skip + .p-row,
  .power-box > .p-set + .p-row {
    border-top: 1px solid var(--bb-divider);
  }
  .p-icon {
    flex: none;
    display: inline-flex;
    color: var(--bb-muted);
  }
  .p-icon.on {
    color: var(--bb-warn);
  }
  .p-icon .icon {
    width: 20px;
    height: 20px;
  }
  .p-text {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  button.p-text {
    border: 0;
    padding: 0;
    margin: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  /* The switch-off's settings open from its text: a chevron says so. */
  .p-open {
    flex-direction: row;
    align-items: center;
    gap: 4px;
  }
  .p-open-text {
    flex: 1 1 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .p-chevron {
    flex: none;
    display: inline-flex;
    color: var(--bb-muted);
  }
  .p-chevron .icon {
    width: 18px;
    height: 18px;
  }
  .p-name {
    font-size: 14px;
    line-height: 18px;
    font-weight: 500;
    overflow-wrap: break-word;
  }
  .p-sub {
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
    overflow-wrap: break-word;
  }
  .p-sub b {
    color: var(--bb-text);
    font-weight: 600;
  }
  .p-row.warn .p-sub {
    color: color-mix(in srgb, var(--bb-warn) 55%, var(--bb-text));
  }
  .p-row.warn .p-icon {
    color: var(--bb-warn);
  }
  .p-auto {
    padding-left: 30px;
    min-height: 40px;
  }
  .p-auto .p-name {
    font-size: 13px;
  }
  .p-auto.waiting .p-name,
  .p-starting .p-name {
    color: color-mix(in srgb, var(--bb-accent) 55%, var(--bb-text));
  }
  .p-auto.waiting .p-icon {
    color: var(--bb-accent);
  }
  .p-skip,
  .p-set {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 0 8px 30px;
  }
  /* A long label wraps on a narrow card rather than leaving it. */
  .p-skip .btn,
  .p-set .btn {
    max-width: 100%;
    white-space: normal;
  }
  .p-starting {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .p-starting .check-spinner {
    margin-top: 2px;
  }
  /* The switch-off's dialog: its temperature, then when. */
  .dlg-label {
    margin: 12px 0 6px;
    font-size: 13px;
    color: var(--bb-muted);
  }
  .step-value {
    min-width: 64px;
    text-align: center;
    font-size: 18px;
    font-weight: 500;
  }
  /* Its choices may take two lines: never cut. */
  .seg.auto-off-when button {
    white-space: normal;
    overflow: visible;
  }
  /* The maintenance dialog: a task per row, its tone in its bar. */
  .maint-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .maint-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--bb-tint);
  }
  .maint-text {
    flex: 1 1 150px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .maint-name {
    font-size: 14px;
    line-height: 20px;
    overflow-wrap: anywhere;
  }
  .maint-when {
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  .maint-row.tone-err .maint-when,
  .maint-row.tone-warn .maint-when {
    color: color-mix(in srgb, var(--tone) 70%, var(--bb-text));
  }
  .maint-bar {
    height: 4px;
    margin-top: 4px;
    border-radius: 2px;
    overflow: hidden;
    background: var(--bb-tint-2);
  }
  .maint-bar > span {
    display: block;
    height: 100%;
    background: var(--tone);
  }
  .maint-confirm {
    flex: 1 1 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    line-height: 18px;
  }
  .maint-confirm > span:first-child {
    flex: 1 1 150px;
  }
  .maint-confirm-actions {
    display: flex;
    flex: none;
    gap: 8px;
    margin-left: auto;
  }
  .maint-foot {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  /* The connection check: running, then the verdict, the problems, and
     folded what passed and what was not checked. */
  .check-running {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
  }
  .check-spinner {
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid var(--bb-tint-2);
    border-top-color: var(--bb-accent);
    animation: spin 0.9s linear infinite;
  }
  .check-verdict {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    line-height: 20px;
    background: color-mix(in srgb, var(--tone) 13%, transparent);
  }
  .check-verdict .icon {
    flex: none;
    color: var(--tone);
  }
  .check-title {
    font-weight: 500;
  }
  .check-detail {
    font-size: 13px;
    line-height: 18px;
  }
  .sev-ok {
    --sev: var(--bb-ok);
  }
  .sev-skip {
    --sev: var(--bb-muted);
  }
  .check-folded {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 2px 0 4px 26px;
  }
  .check-line {
    display: flex;
    flex-direction: column;
    font-size: 13px;
    line-height: 18px;
  }
  .check-line .check-title {
    font-weight: 400;
  }
  .check-line .check-detail {
    color: var(--bb-muted);
  }
  .check-fold .section-label .icon {
    color: var(--tone);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /* Notes and banners. */
  .note {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    font-size: 13px;
    line-height: 18px;
    color: var(--bb-muted);
  }
  .note.warning {
    color: var(--bb-text);
  }
  .note.warning .icon {
    color: var(--bb-warn);
  }
  .hint {
    margin: 0;
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  /* The text keeps lines of 150 px at least -- beside its icon on a
     half-width card too --: else the button goes below it. */
  .callout {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 18px;
    background: color-mix(in srgb, var(--bb-accent) 10%, transparent);
  }
  .callout .btn {
    margin: -4px -4px -4px 0;
    flex: none;
  }
  .callout > .icon {
    color: var(--bb-accent);
  }
  .callout > span {
    flex: 1 1 150px;
  }

  /* The job: picture, name, progress, times. */
  .job {
    display: flex;
    gap: 14px;
    align-items: center;
  }
  .picture {
    position: relative;
    flex: none;
    width: 96px;
    height: 96px;
    border-radius: 12px;
    border: 0;
    padding: 0;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bb-tint);
    color: var(--bb-muted);
  }
  /* The job's picture: the whole tile shows it large, the camera has a
     button of its own in its corner. */
  .picture-open {
    width: 100%;
    height: 100%;
    border: 0;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    color: inherit;
    cursor: pointer;
  }
  .picture-open:focus-visible,
  button.live-hint:focus-visible {
    outline: 2px solid var(--bb-ring);
    outline-offset: -2px;
  }
  /* The job's picture large, where the live view opens. */
  .big-cover {
    position: relative;
    margin: 6px 16px 0;
    border-radius: 12px;
    overflow: hidden;
    background: var(--bb-tint);
    aspect-ratio: 16 / 9;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .big-cover img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .big-cover .icon-btn {
    background: var(--bb-on-picture);
    color: #fff;
  }
  .picture .cover {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .picture .drawing {
    width: 72%;
    height: 72%;
  }
  .live-hint {
    position: absolute;
    right: 6px;
    bottom: 6px;
    /* Large enough for a finger on a phone. */
    width: 30px;
    height: 30px;
    border: 0;
    padding: 0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
  }
  .live-hint .icon {
    width: 18px;
    height: 18px;
  }
  .drawing .d-body {
    fill: none;
    stroke: currentColor;
    stroke-width: 3;
    opacity: 0.55;
  }
  .drawing .d-window {
    fill: currentColor;
    opacity: 0.08;
  }
  .drawing .d-line {
    stroke: currentColor;
    stroke-width: 3;
    stroke-linecap: round;
    opacity: 0.55;
  }
  .drawing .d-head {
    fill: currentColor;
    opacity: 0.7;
  }
  .drawing .d-part {
    fill: var(--bb-accent);
    opacity: 0.75;
  }
  .drawing .d-base {
    fill: currentColor;
    opacity: 0.3;
  }
  .offline-pic .drawing .d-part {
    fill: currentColor;
    opacity: 0.3;
  }
  .job-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .job-name {
    min-width: 0;
    font-size: 15px;
    font-weight: 500;
    line-height: 20px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    word-break: break-word;
  }
  /* A text in a state's colour mixes it with the text colour: the hue stays,
     and it reads at 4.5:1 on light and dark themes -- warning orange alone
     reaches 2:1 on white. An icon keeps the pure colour. */
  .pct {
    font-size: 22px;
    font-weight: 500;
    line-height: 24px;
    color: color-mix(in srgb, var(--tone) 55%, var(--bb-text));
    font-variant-numeric: tabular-nums;
  }
  /* The state line: icon and word in the state's colour; unknown in the
     muted text colour, readable unlike the disabled one. */
  .state {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    line-height: 18px;
    font-weight: 500;
    color: color-mix(in srgb, var(--tone) 55%, var(--bb-text));
    margin-top: -4px;
  }
  .state.tone-off {
    --tone: var(--bb-muted);
  }
  .state .icon {
    width: 16px;
    height: 16px;
    color: var(--tone);
  }
  /* The percentage beside the bar: the same place whatever the name's
     length, and no line above it wraps for it. */
  .bar-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .bar-row .bar {
    flex: 1;
    min-width: 0;
  }
  .bar {
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    background: color-mix(in srgb, var(--tone) 18%, transparent);
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: 4px;
    background: var(--tone);
    transition: width 0.6s ease;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
    font-size: 12px;
    color: var(--bb-muted);
  }
  .meta span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .meta .icon {
    width: 14px;
    height: 14px;
  }

  /* The live view. */
  .live {
    position: relative;
    margin: 6px 16px 0;
    border-radius: 12px;
    overflow: hidden;
    background: #000;
    aspect-ratio: 16 / 9;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .live img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .live-tags {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    gap: 6px;
  }
  .live-badge {
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.4px;
    color: #fff;
    background: rgba(219, 68, 55, 0.92);
  }
  .live-fps {
    background: var(--bb-on-picture);
  }
  .live-tools {
    position: absolute;
    top: 6px;
    right: 6px;
    display: flex;
    gap: 6px;
  }
  .live .icon-btn {
    background: var(--bb-on-picture);
    color: #fff;
  }
  .live-full {
    position: absolute;
    bottom: 6px;
    right: 6px;
  }
  /* Full screen -- the browser's own, or the window where it has none
     (above Home Assistant's header and sidebar). The whole screen, black,
     the picture fitted; the tools stay in the card. */
  .live.full {
    position: fixed;
    inset: 0;
    z-index: 7;
    width: 100%;
    height: 100%;
    max-height: none;
    margin: 0;
    border: 0;
    padding: 0;
    border-radius: 0;
    aspect-ratio: auto;
  }
  .live.full .live-tools {
    display: none;
  }
  .live.full .live-tags {
    top: max(12px, env(safe-area-inset-top));
    left: max(12px, env(safe-area-inset-left));
    right: auto;
    bottom: auto;
    gap: 9px;
  }
  /* Grown as the button grows (36 to 52 px). */
  .live.full .live-badge {
    padding: 3px 12px;
    border-radius: 14px;
    font-size: 16px;
  }
  .live.full .live-full {
    bottom: max(6px, env(safe-area-inset-bottom));
    right: max(6px, env(safe-area-inset-right));
    /* Large enough to find on a phone; the picture's grey disc. */
    width: 52px;
    height: 52px;
  }
  .live.full .live-full .icon {
    width: 30px;
    height: 30px;
  }
  /* Where the picture was while it is full screen. */
  .live-holder {
    margin: 6px 16px 0;
    aspect-ratio: 16 / 9;
  }
  .live.failed {
    flex-direction: column;
    gap: 8px;
    color: #fff;
    font-size: 13px;
    background: #222;
  }
  /* On the dark panel in every theme: white, not the theme's text colour. */
  .live.failed .btn {
    color: #fff;
    background: rgba(255, 255, 255, 0.16);
  }

  /* Temperatures. */
  .temps {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .temps.n1,
  .temps.n2,
  .temps.n4,
  .temps.dual {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  /* As high as an AMS head's second line, which it stands in for. */
  .slot-side {
    font-size: 10px;
    font-weight: 600;
    color: var(--bb-muted);
    height: 13px;
    line-height: 13px;
  }
  .temp {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
    padding: 8px 10px;
    border: 0;
    border-radius: 10px;
    background: var(--bb-tint);
    text-align: left;
    cursor: pointer;
  }
  .temp-head {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--bb-muted);
    max-width: 100%;
    flex-wrap: wrap;
  }
  /* A name too long for a narrow tile wraps at its words, never cut. */
  .temp-head > span:not(.temp-tag) {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .temp-head .icon {
    width: 15px;
    height: 15px;
  }
  /* The active one of two nozzles, as the Control tab's tag. */
  .temp-head .temp-tag,
  .p-name .temp-tag {
    flex: none;
    overflow: visible;
    white-space: nowrap;
    font-size: 11px;
    line-height: 16px;
    font-weight: 500;
    padding: 0 6px;
    border-radius: 8px;
    color: color-mix(in srgb, var(--bb-accent) 50%, var(--bb-text));
    background: color-mix(in srgb, var(--bb-accent) 15%, transparent);
  }
  .temp-value {
    font-size: 18px;
    font-weight: 500;
    line-height: 22px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .temp-target {
    font-size: 12px;
    color: var(--bb-muted);
    white-space: nowrap;
  }
  .temp.heating .temp-head .icon {
    color: var(--bb-heat);
  }
  /* Text in a mix of the tone and the text colour, readable on the tint. */
  .temp.heating .temp-target {
    color: color-mix(in srgb, var(--bb-heat) 55%, var(--bb-text));
  }
  /* A ventilated chamber, in the ventilation's tone. */
  .temp.venting .temp-head .icon {
    color: var(--bb-accent);
  }
  .temp.venting .temp-target {
    color: color-mix(in srgb, var(--bb-accent) 55%, var(--bb-text));
  }

  /* Fans. */
  .fans {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .fan {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px 5px 8px;
    border: 0;
    border-radius: 16px;
    background: var(--bb-tint);
    font-size: 13px;
    cursor: pointer;
    color: var(--bb-muted);
  }
  .fan .icon {
    width: 16px;
    height: 16px;
  }
  span.fan {
    cursor: default;
  }
  .fan-label.full {
    display: none;
  }
  .fan-value {
    color: var(--bb-text);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .fan.on .icon {
    color: var(--bb-accent);
    animation: spin 1.6s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Filament: the strip on the status view. */
  .ams-strip {
    display: flex;
    align-items: stretch;
    padding: 10px 36px 10px 12px;
    border: 0;
    border-radius: 10px;
    background: var(--bb-tint);
    text-align: left;
    cursor: pointer;
    position: relative;
  }
  /* Without a filament view to open: no chevron to make room for. */
  div.ams-strip {
    padding-right: 12px;
    cursor: default;
  }
  /* The AMS units one below the other; the AMS HT units and the external
     spools beside them as long as the widest of them fits there, else
     below. */
  .ams-units {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    flex-wrap: wrap;
    align-items: stretch;
    gap: 21px 24px;
    /* What lies left of or above the units: the line a fill does not need
       where it starts a row or stands in the first one -- but not a
       spool's ring (2 px out, 2 px off). */
    clip-path: inset(-6px -24px -24px -6px);
  }
  /* A line between two AMS units, with room on either side. */
  .ams-column {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .ams-column > .ams-group + .ams-group {
    border-top: 1px solid var(--bb-line);
    margin-top: 10px;
    padding-top: 10px;
  }
  .ams-fill {
    position: relative;
    display: flex;
    flex: 1 1 0%;
    min-width: min-content;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 8px 16px;
  }
  /* The AMS HT units' rows as far apart as the AMS units beside them --
     a line's room, without the line --, so they stand level. */
  .ams-fill.with-ht {
    row-gap: 21px;
  }
  /* Beside the column, a line in the middle of the gap that fades out at
     both ends; below it, a line as between the AMS units. */
  .ams-fill::before,
  .ams-fill::after {
    content: "";
    position: absolute;
  }
  .ams-fill::before {
    top: 0;
    bottom: 0;
    left: -12px;
    width: 1px;
    background: linear-gradient(to bottom, transparent, var(--bb-line) 25%, var(--bb-line) 75%, transparent);
  }
  .ams-fill::after {
    top: -11px;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--bb-line);
  }
  /* With an AMS HT there, each unit is as wide as one -- its second line:
     the humidity, 6 px, the temperature --, so the rows fill evenly: never
     one unit alone above two. An AMS HT then fits beside an AMS from a card
     of about 326 px: a 360 px phone keeps it there with 10 px to spare. */
  .ams-fill.with-ht .ams-head {
    min-width: calc(34px + 8.5ch);
  }
  .ams-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  /* Two lines of one height each -- the name and the model, the humidity
     and the temperature --, so a row's colours stand level. */
  .ams-head {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    font-size: 12px;
    color: var(--bb-muted);
    white-space: nowrap;
  }
  .ams-line,
  .ams-env {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 15px;
  }
  /* The chip a shade darker than the strip it sits on; its text between
     the muted and the text colour, readable on it in both themes. */
  .ams-strip .unit-model,
  .ams-strip .ams-nozzle {
    font-size: 11px;
    line-height: 15px;
    padding: 0 6px;
    border-radius: 8px;
    background: var(--bb-tint-2);
    color: color-mix(in srgb, var(--bb-muted) 50%, var(--bb-text));
  }
  /* A size above the figures below it, in its 15 px line. */
  .ams-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--bb-text);
    line-height: 15px;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  /* A name the user gave the unit in BamBuddy can be long: it wraps word
     by word rather than push the card wider -- a single long word where it
     must --, and its line grows for it; one line stays 15 px, level with
     the units beside it. */
  .ams-line {
    height: auto;
    min-height: 15px;
    flex-wrap: wrap;
    row-gap: 2px;
  }
  /* Room for "99 %" and "88 °C" (the icon, 1px, the figure): a unit keeps
     its width when they change, so it never jumps below the column at 10 %. */
  .ams-env > span {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    font-variant-numeric: tabular-nums;
  }
  .ams-hum {
    min-width: calc(14px + 4ch);
  }
  .ams-temp {
    min-width: calc(14px + 4.5ch);
  }
  .ams-env .icon {
    width: 13px;
    height: 13px;
  }
  .ams-slots {
    display: flex;
    gap: 8px;
  }
  .ams-slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 30px;
  }
  .slot-type {
    font-size: 11px;
    line-height: 13px;
    color: var(--bb-muted);
    max-width: 44px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ams-go {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--bb-muted);
    display: flex;
  }
  /* A spool: its true colour as far as filament is left, the rest a
     neutral track; the outline lies over both. */
  .swatch {
    position: relative;
    display: block;
    width: 24px;
    height: 32px;
    border-radius: 7px;
    overflow: hidden;
    background: var(--bb-tint-2);
  }
  .swatch::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bb-text) 24%, transparent);
    pointer-events: none;
  }
  .swatch.outline::after {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bb-text) 50%, transparent);
  }
  .swatch .fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--fill);
    background: var(--c);
  }
  .swatch.partial .fill {
    box-shadow: 0 -1px 0 color-mix(in srgb, var(--bb-text) 40%, transparent);
  }
  .swatch.empty {
    background: none;
    border: 1.5px dashed var(--bb-line);
    box-sizing: border-box;
  }
  .swatch.empty::after,
  .swatch.empty .fill {
    display: none;
  }
  /* Contents unknown: the bare neutral spool, neither a colour nor empty. */
  .swatch.unknown .fill {
    display: none;
  }
  .swatch.active {
    outline: 2px solid var(--bb-ring);
    outline-offset: 2px;
  }
  .swatch.large {
    width: 30px;
    height: 40px;
    border-radius: 8px;
  }

  /* Controls on the status view. */
  .controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ctl-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .ctl-buttons .btn {
    flex: 1;
  }
  /* Skipping objects is the rarer choice: a plain button in its own row on
     a narrow card. */
  .ctl-buttons .btn.skip {
    flex-basis: 100%;
    min-height: 32px;
  }
  .speed {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  /* The speed as it is, with the controls hidden. */
  .speed-now {
    font-size: 13px;
    font-weight: 500;
  }
  .speed-label,
  .step-label,
  .axis-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--bb-muted);
  }
  .speed-label .icon {
    width: 15px;
    height: 15px;
  }
  .seg {
    display: flex;
    padding: 3px;
    gap: 2px;
    border-radius: 12px;
    background: var(--bb-tint);
  }
  .seg button {
    flex: 1;
    min-width: 0;
    border: 0;
    border-radius: 9px;
    padding: 6px 4px;
    background: none;
    color: var(--bb-muted);
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .seg button[aria-checked="true"] {
    color: color-mix(in srgb, var(--bb-accent) 50%, var(--bb-text));
    background: color-mix(in srgb, var(--bb-accent) 18%, transparent);
    font-weight: 500;
  }
  .seg button:disabled {
    cursor: default;
    opacity: 0.6;
  }
  /* The jog pad's step, locked with the arrows: drawn like them. */
  .step-row .seg button:disabled {
    opacity: 0.4;
  }
  /* A choice on its way: as disabled, and still where the keyboard is. */
  .seg button[aria-disabled="true"] {
    cursor: progress;
    opacity: 0.6;
  }
  /* The speeds: four in a row, two by two on a very narrow card. */
  .seg.speeds {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .seg.speeds button {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 5px 2px;
    line-height: 17px;
  }
  .seg.speeds .opt,
  .seg.speeds .opt-sub {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* The percentage is small: in the option's colour, not paler. */
  .seg.speeds .opt-sub {
    font-size: 11px;
    line-height: 14px;
    font-weight: 400;
    opacity: 1;
    font-variant-numeric: tabular-nums;
  }

  /* Control view: its sections in the user's order; in moving, the step,
     the pad beside the bed, the extruder below them -- beside them where
     there is room. */
  .heating {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px 6px;
    border-radius: 10px;
    background: var(--bb-tint);
  }
  /* The explanation under „Lüften“: half a line from what stands above it,
     as the jog pad's under the extruder. */
  .heating > .hint {
    margin-top: 8px;
  }
  .heat-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 32px;
  }
  .section-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
  }
  .section-label .icon {
    width: 16px;
    height: 16px;
    color: var(--bb-heat);
  }
  .heat-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    min-height: 44px;
  }
  .heat-row + .heat-row {
    border-top: 1px solid var(--bb-divider);
  }
  .heat-name {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .heat-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
  }
  .heat-label span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The name itself is never cut ("Right nozzle" beside a thumb's 44 px
     Off): it wraps in whole words. */
  .heat-label .heat-text {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    overflow-wrap: break-word;
  }
  .heat-label .icon {
    width: 16px;
    height: 16px;
    color: var(--bb-muted);
  }
  /* A heater that is on, as the Status tab's tile. */
  .heat-name.on .heat-label .icon {
    color: var(--bb-heat);
  }
  /* Ventilation in its own tone: the head always, the row while it runs. */
  .vent-head .section-label .icon,
  .heat-name.vent.on .heat-label .icon {
    color: var(--bb-accent);
  }
  /* The name keeps its room: a tag that does not fit goes below it. */
  .heat-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 6px;
    row-gap: 2px;
    min-width: 0;
  }
  .heat-label .heat-tag {
    flex: none;
    overflow: visible;
    font-size: 11px;
    line-height: 16px;
    font-weight: 500;
    padding: 0 6px;
    border-radius: 8px;
    color: color-mix(in srgb, var(--bb-accent) 50%, var(--bb-text));
    background: color-mix(in srgb, var(--bb-accent) 15%, transparent);
  }
  .heat-now {
    font-size: 12px;
    color: var(--bb-muted);
    padding-left: 22px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  /* The fans the ventilation runs: two of them take a second line, never the stepper's room. */
  .heat-name.vent .heat-now {
    white-space: normal;
  }
  .heat-set {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  /* The steppers and the power symbol, and the place of one that cannot be used. */
  .heat-row .btn.icon-only {
    width: 34px;
    min-height: 34px;
    height: 34px;
  }
  .heat-row .heat-off-space {
    width: 34px;
    min-height: 34px;
    height: 34px;
  }
  .heat-target {
    min-width: 62px;
    text-align: center;
    font-size: 15px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .heat-target.off {
    color: var(--bb-muted);
    font-weight: 400;
  }
  .btn.heat-off {
    color: var(--bb-muted);
  }
  .btn.heat-off:not(:disabled):hover {
    color: var(--bb-text);
  }
  /* On in the tone of what it does. */
  .btn.heat-off.on.tone-heat {
    color: var(--bb-heat);
  }
  .btn.heat-off.on.tone-vent {
    color: var(--bb-accent);
  }
  /* The print options: folded under a head that says what is off; a row
     per detection, only its switch taps. */
  .detection {
    display: flex;
    flex-direction: column;
    padding: 4px 10px;
    border-radius: 10px;
    background: var(--bb-tint);
  }
  .det-head {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .det-head:focus-visible {
    border-radius: 6px;
  }
  .detection .section-label {
    flex: 1;
    min-height: 32px;
  }
  .det-summary {
    flex: none;
    font-size: 13px;
    color: var(--bb-muted);
  }
  .det-chevron {
    flex: none;
    display: inline-flex;
    color: var(--bb-muted);
    transition: transform 0.15s;
  }
  .det-chevron.open {
    transform: rotate(180deg);
  }
  .det-body {
    padding-bottom: 4px;
  }
  .detection .section-label .icon {
    color: var(--bb-accent);
  }
  .det-rows {
    display: flex;
    flex-direction: column;
  }
  .det-row {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 44px;
    padding: 4px 0;
    font-size: 14px;
    line-height: 18px;
  }
  .det-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .det-sub {
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  /* The switch: a 48 x 36 target around the small track. */
  .det-switch {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    width: 48px;
    height: 36px;
    margin-right: -2px;
    padding: 0 2px;
    border: 0;
    border-radius: 18px;
    background: none;
    cursor: pointer;
  }
  .det-rows > .det-row + .det-row {
    border-top: 1px solid var(--bb-divider);
  }
  .det-name {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .toggle {
    position: relative;
    flex: none;
    width: 36px;
    height: 20px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--bb-muted) 60%, transparent);
    /* An edge, so the off track stands out from its box (3:1 and more). */
    box-shadow: inset 0 0 0 1px var(--bb-muted);
    transition: background 0.15s;
  }
  .toggle .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    transition: transform 0.15s;
  }
  .det-switch[aria-checked="true"] .toggle {
    background: var(--bb-accent);
    box-shadow: none;
  }
  .det-switch[aria-checked="true"] .knob {
    transform: translateX(16px);
  }
  .det-switch:disabled {
    cursor: default;
  }
  .det-switch:disabled .toggle {
    opacity: 0.4;
  }
  .det-switch[aria-disabled="true"] {
    cursor: progress;
  }
  .det-switch[aria-disabled="true"] .toggle {
    opacity: 0.4;
  }
  .det-state {
    flex: none;
    font-size: 13px;
    color: var(--bb-muted);
  }
  .detection .hint {
    margin-top: 4px;
  }
  .nozzle-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .nozzle-row .seg {
    flex: 1;
    max-width: 260px;
  }
  .control {
    display: grid;
    grid-template-columns: auto auto;
    grid-template-areas: "step step" "pad bed" "ext ext";
    justify-content: center;
    align-items: start;
    gap: 14px 18px;
  }
  .step-row {
    grid-area: step;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .step-row .seg {
    flex: 1;
  }
  .pad {
    grid-area: pad;
    display: grid;
    grid-template-columns: repeat(3, 52px);
    grid-template-rows: repeat(3, 52px);
    grid-template-areas: ". n ." "w h e" ". s .";
    gap: 6px;
  }
  .pad .btn {
    width: 52px;
    height: 52px;
    border-radius: 14px;
  }
  .pad .btn .icon {
    width: 22px;
    height: 22px;
  }
  .pad .n {
    grid-area: n;
  }
  .pad .w {
    grid-area: w;
  }
  .pad .home {
    grid-area: h;
  }
  .pad .e {
    grid-area: e;
  }
  .pad .s {
    grid-area: s;
  }
  .axis-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .axis-col.bed {
    grid-area: bed;
    height: 100%;
  }
  .axis-col.ext {
    grid-area: ext;
    align-items: stretch;
  }
  .ext-buttons {
    display: flex;
    gap: 8px;
  }
  .ext-buttons .btn {
    flex: 1;
  }
  .btn.stack {
    flex-direction: column;
    gap: 2px;
    width: 84px;
    flex: 1;
    min-height: 56px;
    padding: 6px 4px;
    border-radius: 14px;
    font-size: 12px;
    white-space: normal;
    line-height: 14px;
  }
  .btn.stack .icon {
    width: 20px;
    height: 20px;
  }
  .ext-buttons .btn.stack {
    flex-direction: row;
    gap: 6px;
    width: auto;
    min-height: 40px;
    font-size: 13px;
  }

  /* Filament view. */
  .unit {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .unit + .unit {
    border-top: 1px solid var(--bb-divider);
    padding-top: 12px;
  }
  .unit-head {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* An AMS unit's head folds and unfolds it: the whole row is the button. */
  button.unit-head {
    width: 100%;
    margin: -6px -8px;
    padding: 6px 8px;
    box-sizing: content-box;
    border: 0;
    border-radius: 8px;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  button.unit-head:hover {
    background: var(--bb-tint);
  }
  button.unit-head:focus-visible {
    outline: 2px solid var(--bb-ring);
    outline-offset: -2px;
  }
  .unit-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 10px;
    width: 100%;
  }
  .unit-fold {
    display: flex;
    color: var(--bb-muted);
    transition: transform 0.2s ease;
  }
  .unit.open .unit-fold {
    transform: rotate(180deg);
  }
  .unit-colors {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 2px;
  }
  .unit-name {
    font-weight: 500;
    font-size: 15px;
    /* A name from BamBuddy in one long word breaks rather than leave the card. */
    overflow-wrap: anywhere;
  }
  /* A unit's model, and on a two-nozzle printer the nozzle it feeds. */
  .unit-model,
  .unit-nozzle,
  .ams-nozzle {
    font-size: 12px;
    color: var(--bb-muted);
    padding: 1px 8px;
    border-radius: 10px;
    background: var(--bb-tint);
  }
  /* The figures and the chevron stay together: a wrap moves both. */
  .unit-end {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .unit-nozzle {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .unit-nozzle .icon {
    width: 14px;
    height: 14px;
  }
  .unit-env {
    display: flex;
    gap: 10px;
    font-size: 13px;
    color: var(--bb-muted);
  }
  .unit-env span {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .unit-env .icon {
    width: 15px;
    height: 15px;
  }
  .drying {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 8px;
    font-size: 13px;
    color: var(--bb-muted);
    min-height: 32px;
  }
  .drying > span {
    flex: 1 1 auto;
  }
  /* The text wraps beside its button before the button goes below it. */
  .drying > .drying-text {
    flex: 1 1 0;
    min-width: 8em;
  }
  .drying > .btn {
    margin-left: auto;
  }
  .drying.on {
    color: var(--bb-text);
  }
  .drying.on > .icon {
    color: var(--bb-heat);
  }
  /* No buttons where the printer dries from its own screen only: where
     instead, on a line of its own below the state. */
  .drying > .dry-where {
    flex: 1 0 100%;
    box-sizing: border-box;
    padding-left: 26px;
    color: var(--bb-muted);
    font-size: 12px;
  }
  /* One column no wider than the card: a slot's sub line never widens it. */
  .slots {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }
  .slot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 6px;
    border-radius: 10px;
    background: var(--bb-tint);
  }
  .slot.active {
    background: color-mix(in srgb, var(--bb-accent) 10%, transparent);
  }
  .slot-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    padding: 0;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .slot-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  /* A long name takes two lines before it is cut. */
  .slot-name {
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
    overflow: hidden;
    overflow-wrap: break-word;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  /* Never cut: beside a pencil and a button on a narrow card it wraps. */
  .slot-sub {
    font-size: 12px;
    color: var(--bb-muted);
    overflow-wrap: break-word;
  }
  .slot-sub .in-use {
    font-weight: 500;
    color: color-mix(in srgb, var(--bb-accent) 55%, var(--bb-text));
  }
  .slot .btn {
    flex: none;
    min-height: 32px;
    padding: 0 12px;
    font-size: 13px;
  }
  /* Setting a spool's filament: a quiet pencil beside the main action. */
  .slot .btn.edit {
    width: 32px;
    padding: 0;
    color: var(--bb-muted);
  }
  .slot .btn.edit:not(:disabled):hover {
    color: var(--bb-text);
  }

  /* The error line. */
  /* It sticks to the bottom of the screen while the card's own bottom is
     further down: a tap far up a tall card still shows why it failed. */
  .toast {
    position: sticky;
    bottom: 12px;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 16px 14px;
    padding: 8px 6px 8px 12px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 18px;
    color: var(--bb-text);
    background: linear-gradient(color-mix(in srgb, var(--bb-err) 16%, transparent), color-mix(in srgb, var(--bb-err) 16%, transparent)),
      var(--ha-card-background, var(--card-background-color, #fff));
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }
  .toast > .icon {
    color: var(--bb-err);
  }
  .toast > span {
    flex: 1;
  }
  .toast .icon-btn {
    width: 30px;
    height: 30px;
    background: none;
  }

  /* Inside an open dialog the notices stand in its flow. */
  .dlg-body .toast {
    position: static;
    margin: 0;
    box-shadow: none;
  }
  .dlg-body .sent-slot {
    position: static;
    height: auto;
  }
  .dlg-body .sent {
    position: static;
    transform: none;
    width: fit-content;
    margin: 0 auto;
  }
  /* "Sent": a snackbar over the card's bottom, so nothing moves while it shows. */
  .sent-slot {
    position: sticky;
    bottom: 12px;
    z-index: 1;
    height: 0;
  }
  .sent {
    position: absolute;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px 4px 8px;
    border-radius: 14px;
    font-size: 13px;
    line-height: 18px;
    white-space: nowrap;
    pointer-events: none;
    /* Inverse, as a snackbar: it lies over the card, it is not part of it. */
    color: var(--ha-card-background, var(--card-background-color, #fff));
    background: var(--bb-text);
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.25);
    animation: sent-in 0.15s ease-out;
  }
  .sent .icon {
    width: 16px;
    height: 16px;
    color: var(--bb-ok);
  }
  @keyframes sent-in {
    from {
      opacity: 0;
    }
  }

  /* What the AMS is doing: a line in the job, a bar in the filament view. */
  .ams-activity {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: color-mix(in srgb, var(--bb-accent) 55%, var(--bb-text));
  }
  .ams-activity .icon,
  .activity .icon {
    width: 15px;
    height: 15px;
    color: var(--bb-accent);
    animation: spin 1.6s linear infinite;
  }
  .activity {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px 10px;
    border-radius: 10px;
    font-size: 13px;
    color: var(--bb-text);
    background: color-mix(in srgb, var(--bb-accent) 10%, transparent);
  }
  .activity-bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    width: 30%;
    border-radius: 2px;
    background: var(--bb-accent);
    animation: slide 1.4s ease-in-out infinite;
  }
  @keyframes slide {
    from {
      left: -30%;
    }
    to {
      left: 100%;
    }
  }

  /* Dialogs: on the theme's dialog surface, with an edge and a darker
     backdrop, so that they stand out from a dark page too. */
  dialog {
    --bb-surface: var(--ha-dialog-surface-background, var(--mdc-theme-surface, var(--card-background-color, #fff)));
    /* Scrolled to, a control stays clear of the edge and of the button row
       at the foot (one row; the card sets it from the row's height). */
    scroll-padding-block: 12px 80px;
    border: 0;
    padding: 0;
    border-radius: 16px;
    /* As Home Assistant's dialogs: a width they want, never wider than the
       screen less a margin -- on a phone the screen less 16 px a side. */
    max-width: min(440px, calc(100vw - 32px));
    width: 100%;
    color: var(--bb-text);
    background: var(--bb-surface);
    box-shadow:
      0 0 0 1px var(--bb-divider),
      0 12px 40px rgba(0, 0, 0, 0.3);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.55);
  }
  /* A pop-up is never see-through, even where the theme makes its surface
     so -- the card behind would show: the theme's colour at full strength.
     A browser that cannot take a colour's alpha away keeps the theme's. */
  @supports (color: rgb(from red r g b / 1)) {
    dialog {
      --bb-surface: rgb(from var(--ha-dialog-surface-background, var(--mdc-theme-surface, var(--card-background-color, #fff))) r g b / 1);
    }
    .menu {
      background: rgb(from var(--ha-card-background, var(--card-background-color, #fff)) r g b / 1);
    }
  }
  .dlg-body {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
  }
  .dlg-body h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 500;
    line-height: 24px;
    /* A name of one long word (an AMS label) breaks rather than leave the dialog. */
    overflow-wrap: anywhere;
  }
  .dlg-body p {
    margin: 0;
    font-size: 14px;
    line-height: 20px;
    color: var(--bb-muted);
  }
  /* At the dialog's foot while it scrolls: the buttons stay in reach. */
  .dlg-actions {
    position: sticky;
    bottom: 0;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    margin: 4px -20px -20px;
    padding: 12px 20px 20px;
    background: var(--bb-surface);
  }
  /* The theme's red, darkened: white on it reaches 4.5:1 (5.6:1 on Home
   * Assistant's own). */
  .dlg-actions .btn.danger {
    color: #fff;
    background: color-mix(in srgb, var(--bb-err) 85%, #000);
  }
  .dlg-actions .btn {
    max-width: 100%;
    white-space: normal;
  }
  .dlg-actions .btn.safe {
    color: var(--bb-text);
  }
  .dlg-body .dlg-suggested {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--bb-text);
  }
  .dlg-suggested .icon {
    flex: none;
    width: 16px;
    height: 16px;
    color: var(--bb-ok);
  }
  /* The spools disagree: a neutral note, it may take two lines. */
  .dlg-body .dlg-suggested.mixed {
    align-items: flex-start;
  }
  .dlg-suggested.mixed .icon {
    margin-top: 2px;
    color: var(--bb-muted);
  }
  .dlg-body .dlg-warn {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    font-size: 13px;
    line-height: 18px;
    color: var(--bb-text);
  }
  .dlg-warn .icon {
    color: var(--bb-warn);
  }
  /* A note, not a warning. */
  .dlg-warn.info .icon {
    color: var(--bb-accent);
  }
  .dlg-error {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 14px;
    line-height: 20px;
    background: color-mix(in srgb, var(--bb-err) 12%, transparent);
  }
  .dlg-error .icon {
    color: var(--bb-err);
  }
  /* Set ends the spool's assignment: a line of its own above the buttons. */
  .dlg-actions .dlg-warn {
    flex: 1 0 100%;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 13px;
    line-height: 18px;
    color: color-mix(in srgb, var(--bb-warn) 75%, var(--bb-text));
  }
  .dlg-actions .dlg-warn .icon {
    flex: none;
    width: 16px;
    height: 16px;
    margin-top: 1px;
  }
  /* The slot's profile: a heading and what the list holds. */
  .fil-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .fil-title {
    font-size: 14px;
    line-height: 20px;
    font-weight: 500;
  }
  .fil-help {
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  /* What the confirming button still waits for, beside it. */
  .dlg-actions .dlg-need {
    flex: 1;
    align-self: center;
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  /* The HMS messages: each in its severity -- error red, warning orange,
     notice blue. */
  .hms-item {
    --sev: var(--bb-warn);
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 14px;
    line-height: 20px;
    background: color-mix(in srgb, var(--sev) 12%, transparent);
  }
  .sev-error {
    --sev: var(--bb-err);
  }
  .sev-notice {
    --sev: var(--bb-info);
  }
  /* No scroll box of its own: the dialog scrolls as a whole (a touch
     screen shows no scrollbar, and a swipe would scroll the inner box). */
  .hms-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hms-item > .icon {
    color: var(--sev);
    margin-top: 1px;
  }
  .hms-body {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .hms-code {
    font-size: 11px;
    line-height: 16px;
    color: var(--bb-muted);
    font-family: var(--ha-font-family-code, monospace);
  }
  /* The filament dialog's slot tools: chip and reset, below a line. */
  .slot-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
    padding-top: 12px;
    border-top: 1px solid var(--bb-divider);
  }
  .slot-tools .btn {
    max-width: 100%;
    white-space: normal;
  }
  /* The K profile: label above, the select over the dialog's width -- a
     profile's name is long. */
  .field.kfield {
    flex-wrap: nowrap;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }
  .field.kfield .select {
    max-width: none;
  }
  /* Vendor and filament: beside their labels, in one column so the two
     selects line up, each over the rest of the row; on a dialog too narrow
     for the list's longest name and its "Keep" beside the widest label,
     under their labels at the dialog's width, as the colour and the K
     profile. */
  .fil-fields {
    container-type: inline-size;
  }
  .fil-grid {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: 14px 12px;
  }
  .fil-grid > .field {
    display: contents;
  }
  .fil-grid .select {
    max-width: none;
  }
  @container (max-width: 329px) {
    .fil-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
    }
    .fil-grid > .field + .field label {
      margin-top: 8px;
    }
  }
  .rfid-spool {
    font-weight: 500;
  }
  /* What the kept profile is, under the vendor field. */
  .dlg-body .fil-keep {
    margin-top: 6px;
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  /* The slot dialog's switch: its filament, or a spool of the inventory. */
  .inv-switch button[aria-selected="true"] {
    color: color-mix(in srgb, var(--bb-accent) 50%, var(--bb-text));
    background: color-mix(in srgb, var(--bb-accent) 18%, transparent);
    font-weight: 500;
  }
  /* The slot's spool from BamBuddy's inventory. */
  .inv-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--bb-tint);
    font-size: 13px;
    line-height: 18px;
  }
  .inv-from {
    color: var(--bb-muted);
    font-size: 12px;
  }
  .inv-spool {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .inv-name {
    font-weight: 500;
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .inv-line {
    color: var(--bb-muted);
    overflow-wrap: anywhere;
  }
  /* The spool is assigned to other slots too. */
  .inv-also {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin-top: 4px;
    color: color-mix(in srgb, var(--bb-warn) 75%, var(--bb-text));
  }
  .inv-also .icon {
    flex: none;
    width: 16px;
    height: 16px;
    margin-top: 1px;
  }
  /* The inventory's way: the list in a box of its own that takes the room
     left and scrolls (the one such box of the card's dialogs), so that the
     head and the buttons stay in reach; about three rows at least, below
     that the dialog scrolls as well. */
  .dlg-body:has(.inv-list) {
    max-height: calc(100dvh - 48px);
    box-sizing: border-box;
  }
  .inv-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
  }
  .inv-filters {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 10px;
  }
  /* Side by side, each label above its select. */
  .inv-filters .field {
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
  }
  .inv-filters .select {
    max-width: none;
  }
  /* The location below vendor and material, across the row. */
  .inv-filters .field.inv-wide {
    grid-column: 1 / -1;
  }
  .inv-search {
    width: 100%;
    box-sizing: border-box;
  }
  .inv-search {
    font: inherit;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--bb-divider);
    color: var(--bb-text);
    background: transparent;
  }
  .inv-list {
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--bb-divider);
    border-radius: 12px;
    padding: 4px;
  }
  .inv-list.many {
    min-height: min(180px, 40dvh);
  }
  /* A short screen (a phone held sideways): the dialog scrolls as a whole,
     its button row at its foot; the list keeps a cap of its own. */
  @media (max-height: 560px) {
    .dlg-body:has(.inv-list) {
      max-height: none;
    }
    .inv-list {
      max-height: max(180px, 45dvh);
    }
  }
  .inv-group {
    padding: 8px 8px 2px;
    font-size: 12px;
    color: var(--bb-muted);
    letter-spacing: 0.02em;
  }
  .inv-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px;
    border-radius: 9px;
    cursor: pointer;
    font-size: 13px;
    line-height: 18px;
  }
  .inv-row .spool-dot {
    margin-top: 2px;
  }
  .inv-row[aria-checked="true"] {
    background: color-mix(in srgb, var(--bb-accent) 16%, transparent);
  }
  .inv-row[aria-disabled="true"] {
    cursor: default;
    opacity: 0.55;
  }
  .inv-row:focus-visible {
    outline: 2px solid var(--bb-ring);
    outline-offset: -2px;
  }
  .inv-row-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  /* The place, read without colour too: a dot before it. */
  .inv-where::before {
    content: "• ";
  }
  .inv-where.here {
    color: color-mix(in srgb, var(--bb-accent) 70%, var(--bb-text));
  }
  .inv-where.elsewhere {
    color: color-mix(in srgb, var(--bb-warn) 75%, var(--bb-text));
  }
  .inv-where.stored,
  .inv-where.off {
    color: var(--bb-muted);
  }
  .inv-unassign {
    margin-inline-end: auto;
  }
  /* A spool's colour; a multicolour spool's in segments. */
  .spool-dot {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--dot);
  }
  .spool-dot.outline {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bb-text) 35%, transparent);
  }
  /* What the K field holds, between its label and the select. */
  .k-about {
    margin-top: -2px;
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  .k-hint {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  /* While the printer is asked: a spinner beside what happens; orange once
     it takes long. A note after the answer, as the dialog's others. */
  .k-wait {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    /* Two lines from the start: the slower note takes them without moving the dialog. */
    min-height: 36px;
    margin-top: 6px;
    font-size: 13px;
    line-height: 18px;
    color: var(--bb-text);
  }
  .k-wait.slow {
    color: color-mix(in srgb, var(--bb-warn) 55%, var(--bb-text));
  }
  .k-wait .check-spinner {
    margin-top: 1px;
  }
  .k-hint-box > .dlg-note {
    margin-top: 6px;
  }
  /* The nozzle that feeds the slot, quiet under the dialog's title. */
  .nozzle-line {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: -6px;
    font-size: 13px;
    line-height: 18px;
    color: var(--bb-muted);
  }
  .nozzle-line > span {
    display: flex;
    gap: 6px;
    align-items: flex-start;
  }
  .nozzle-line .icon {
    flex: none;
    width: 16px;
    height: 16px;
    margin-top: 1px;
  }
  /* A message's answers, as on the printer's screen; long ones wrap. */
  .hms-answers {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .hms-answers .btn {
    max-width: 100%;
    white-space: normal;
    text-align: start;
  }
  .hms-wiki {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    padding: 6px 0;
    font-size: 13px;
    color: color-mix(in srgb, var(--bb-accent) 55%, var(--bb-text));
    text-decoration: none;
  }
  .hms-wiki .icon {
    width: 16px;
    height: 16px;
  }
  /* A fact sheet: label left, value right, a copy button beside it. */
  .spec {
    display: flex;
    flex-direction: column;
    margin: -4px 0;
  }
  .spec-row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 36px;
    padding: 3px 0;
    font-size: 14px;
    line-height: 20px;
  }
  .spec-row + .spec-row {
    border-top: 1px solid var(--bb-divider);
  }
  .spec-label {
    flex: none;
    max-width: 45%;
    color: var(--bb-muted);
  }
  .spec-value {
    flex: 1;
    min-width: 0;
    text-align: right;
    overflow-wrap: anywhere;
    font-variant-numeric: tabular-nums;
  }
  .spec-value.lines {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  /* A nozzle's side: its symbol and L or R, kept together. */
  .spec-side {
    white-space: nowrap;
    color: var(--bb-muted);
  }
  .spec-side .icon {
    width: 16px;
    height: 16px;
    vertical-align: -3px;
  }
  .spec-sub {
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
  }
  .spec-value.update {
    color: color-mix(in srgb, var(--bb-warn) 55%, var(--bb-text));
    font-weight: 500;
  }
  .spec-value .chip {
    padding: 1px 9px;
    font-size: 12px;
  }
  .spec-row .copy {
    width: 32px;
    height: 32px;
    margin: -4px -6px -4px -6px;
    background: none;
  }
  .spec-row .copy .icon {
    width: 16px;
    height: 16px;
  }
  /* Release notes: Home Assistant's update dialog shows them. */
  .btn.release {
    align-self: flex-start;
  }
  .btn.release .icon {
    width: 16px;
    height: 16px;
  }
  /* "Copied", inside the dialog: the card's own snackbar lies behind it.
     Sticky above the button row, as the card's "Sent": in view while the
     dialog scrolls too; no gap of its own in the dialog's column. */
  .dlg-snack {
    position: sticky;
    bottom: 76px;
    height: 0;
    margin-top: -14px;
    /* Above the sticky button row (1). */
    z-index: 2;
  }
  /* Its pill a snackbar in the wrapper, not in the flow as a dialog's "Sent". */
  .dlg-body .dlg-snack .sent {
    position: absolute;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    margin: 0;
  }
  /* No scroll box of its own: the dialog scrolls as a whole. */
  .objects {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 -8px;
  }
  .obj {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 40px;
    padding: 0 8px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
  }
  .obj:hover {
    background: var(--bb-tint);
  }
  .obj input {
    flex: none;
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--bb-err);
  }
  .obj-name {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .obj.skipped {
    cursor: default;
    color: var(--bb-muted);
  }
  .obj.skipped:hover {
    background: none;
  }
  .obj.skipped .obj-name {
    text-decoration: line-through;
  }
  .obj-note {
    font-size: 12px;
  }
  .field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .field label {
    font-size: 14px;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .stepper.centered {
    justify-content: center;
  }
  .stepper input {
    width: 54px;
    padding: 6px 4px;
    border: 1px solid var(--bb-line);
    border-radius: 8px;
    font: inherit;
    font-size: 15px;
    text-align: center;
    color: var(--bb-text);
    background: none;
    -moz-appearance: textfield;
  }
  .stepper input::-webkit-inner-spin-button,
  .stepper input::-webkit-outer-spin-button {
    -webkit-appearance: none;
  }
  .stepper .unit-text {
    font-size: 13px;
    color: var(--bb-muted);
    min-width: 22px;
  }
  /* A note in a dialog: what else to know. */
  .dlg-body .dlg-note {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    font-size: 13px;
    line-height: 18px;
    color: var(--bb-text);
  }
  .dlg-note .icon {
    flex: none;
    width: 16px;
    height: 16px;
    margin-top: 1px;
    color: var(--bb-info);
  }
  .dlg-note.warning .icon {
    color: var(--bb-warn);
  }
  /* The filament dialog: the material, then the colours. The select draws
     its own arrow, in the theme's colours. */
  .select {
    position: relative;
    flex: 1;
    min-width: 0;
    max-width: 200px;
    display: flex;
  }
  .select select {
    flex: 1;
    min-width: 0;
    appearance: none;
    padding: 7px 30px 7px 10px;
    border: 1px solid var(--bb-line);
    border-radius: 8px;
    font: inherit;
    font-size: 14px;
    color: var(--bb-text);
    background: var(--bb-surface);
    cursor: pointer;
    text-overflow: ellipsis;
  }
  /* The prompt to choose reads as one, not as a value. */
  .select select.unset {
    color: var(--bb-muted);
  }
  .select select:focus-visible {
    outline: 2px solid var(--bb-ring);
    outline-offset: 2px;
  }
  .select option {
    color: var(--bb-text);
    background: var(--bb-surface);
  }
  .select .icon {
    position: absolute;
    right: 7px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--bb-muted);
    pointer-events: none;
  }
  .colors {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .field-label {
    font-size: 14px;
  }
  .palette {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* Eight colours a row; the one outside the palette below them, in the
     same grid, beside "Other color". */
  .swatches,
  .other-row {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 8px;
  }
  /* A colour: outlined like a spool, so white and black show on every
     theme; the chosen one has a ring. */
  .pal {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--c);
    cursor: pointer;
  }
  .pal::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bb-text) 24%, transparent);
    pointer-events: none;
  }
  .pal.outline::after {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bb-text) 50%, transparent);
  }
  .pal[aria-checked="true"] {
    box-shadow:
      0 0 0 2px var(--bb-surface),
      0 0 0 4px var(--bb-accent);
  }
  .pal:focus-visible {
    outline-offset: 5px;
  }
  .other-row {
    align-items: center;
  }
  /* The browser's colour picker lies over the button and opens on a tap. */
  .other-color {
    position: relative;
    grid-column: 1 / -1;
    justify-self: start;
    cursor: pointer;
  }
  .other-row .pal + .other-color {
    grid-column: 2 / -1;
  }
  .other-color input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    opacity: 0;
    cursor: pointer;
  }
  .other-color:focus-within {
    outline: 2px solid var(--bb-ring);
    outline-offset: 2px;
  }

  /* Wide: a bigger picture, the temperatures in one row, slots in two columns. */
  @container (min-width: 520px) {
    .picture {
      width: 132px;
      height: 132px;
    }
    .job-name {
      font-size: 16px;
    }
    .pct {
      font-size: 26px;
      line-height: 28px;
    }
    .temps.n2,
    .temps.n3,
    .temps.n4 {
      grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr));
    }
    .temps.n2 {
      --cols: 2;
    }
    .temps.n3 {
      --cols: 3;
    }
    .ctl-buttons .btn,
    .ctl-buttons .btn.skip {
      flex: none;
      min-width: 120px;
    }
    .ctl-buttons .btn.skip {
      min-height: 36px;
      margin-left: auto;
    }
    .fan-label.short {
      display: none;
    }
    .fan-label.full {
      display: inline;
    }
    .slots {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .live,
    .live-holder {
      max-height: 360px;
    }
    .control {
      grid-template-columns: auto auto auto;
      grid-template-areas: "step step step" "pad bed ext";
    }
    .axis-col.ext {
      height: 100%;
      align-items: center;
    }
    .ext-buttons {
      flex-direction: column;
      flex: 1;
    }
    .ext-buttons .btn.stack {
      flex-direction: column;
      width: 84px;
      font-size: 12px;
    }
  }
  /* Very wide: the heaters and the detections in two columns -- narrower,
     their names would not fit. */
  @container (min-width: 760px) {
    .det-rows {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: 24px;
    }
    .det-rows > .det-row + .det-row {
      border-top: 0;
    }
    .det-rows > .det-row:nth-child(n + 3) {
      border-top: 1px solid var(--bb-divider);
    }
    .heat-rows {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: 24px;
    }
    .heat-row + .heat-row {
      border-top: 0;
    }
    .heat-row:nth-child(n + 3) {
      border-top: 1px solid var(--bb-divider);
    }
  }

  /* Very narrow: less padding; the speed names and the step label get the room. */
  @container (max-width: 340px) {
    ha-card {
      --bb-inset: 12px;
    }
    .head {
      padding: 12px 12px 8px;
      gap: 8px;
    }
    .tabs {
      margin: 0 12px 4px;
    }
    .body {
      padding: 10px 12px 14px;
    }
    .picture {
      width: 80px;
      height: 80px;
    }
    .seg button {
      font-size: 12px;
      padding: 6px 2px;
    }
    .seg.speeds {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    /* The heaters' names keep their room: no icon, smaller steppers. */
    .heating {
      padding: 6px 8px 4px;
    }
    .heat-row {
      gap: 4px;
    }
    .heat-label .icon {
      display: none;
    }
    .heat-now {
      padding-left: 0;
    }
    .heat-row .btn.icon-only {
      width: 30px;
      height: 30px;
      min-height: 30px;
    }
    .heat-row .heat-off-space {
      width: 30px;
      height: 30px;
      min-height: 30px;
    }
    .heat-target {
      min-width: 54px;
      font-size: 14px;
    }
    .pad {
      grid-template-columns: repeat(3, 46px);
      grid-template-rows: repeat(3, 46px);
    }
    .pad .btn {
      width: 46px;
      height: 46px;
    }
    .btn.stack {
      width: 76px;
    }
  }

  /* A phone: a notice's button below its text, the notice's full width. */
  @container (max-width: 400px) {
    .callout .btn {
      flex: 1 0 100%;
      margin: 4px 0 0;
    }
  }

  /* A half-width card: the control view in one column -- the step, the pad,
     the bed, the extruder --, smaller pad buttons, a heater's name and
     temperature above its steppers, two temperature tiles a row. */
  @container (max-width: 280px) {
    /* The print controls at their own width, wrapping as wholes: no label on two lines beside another. */
    .ctl-buttons .btn {
      flex: 1 1 auto;
    }
    /* The plugs' rows: the text on its line, the switch or Run under it, at
       the end; the switch-off's row no longer indented. */
    .p-row {
      flex-wrap: wrap;
      row-gap: 4px;
    }
    .p-row .p-text {
      flex-basis: calc(100% - 30px);
    }
    .p-row > .btn,
    .p-row > .det-switch {
      margin-left: auto;
    }
    .p-auto,
    .p-set {
      padding-left: 0;
    }
    /* A slot's actions under its name, its sub line wrapping: "In use" in
       whole words. */
    .slot {
      flex-wrap: wrap;
    }
    .slot-main {
      flex: 1 0 100%;
    }
    .slot .btn:not(.edit) {
      flex: 1 0 auto;
    }
    .slot-sub {
      white-space: normal;
    }
    /* The step's three choices on a line of their own: "10 mm" never cut. */
    .step-row {
      flex-wrap: wrap;
    }
    .step-row .seg {
      order: 2;
      flex: 1 0 100%;
    }
    .step-row .live-btn {
      margin-left: auto;
    }
    .temps {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    /* The steppers under the name: room before the line to the next heater. */
    .heat-row {
      grid-template-columns: minmax(0, 1fr) auto;
      padding-bottom: 8px;
    }
    .heat-row + .heat-row {
      padding-top: 6px;
    }
    /* The name and Off on a row, the steppers below with the whole width:
       beside a thumb's 44 px Off they would shrink under 24 px. */
    .heat-name {
      grid-column: 1;
      grid-row: 1;
    }
    .heat-row .heat-off {
      grid-column: 2;
      grid-row: 1;
    }
    .heat-row .heat-off-space {
      grid-column: 2;
      grid-row: 1;
    }
    .heat-set {
      grid-column: 1 / -1;
    }
    .heat-now {
      white-space: normal;
    }
    .heat-target {
      min-width: 44px;
    }
    .control {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: "step" "pad" "bed" "ext";
      justify-content: stretch;
      justify-items: center;
    }
    .step-row,
    .axis-col.ext {
      justify-self: stretch;
    }
    .pad {
      grid-template-columns: repeat(3, 40px);
      grid-template-rows: repeat(3, 40px);
    }
    .pad .btn {
      width: 40px;
      height: 40px;
    }
    .axis-col.bed {
      flex-direction: row;
      flex-wrap: wrap;
      justify-content: center;
      justify-self: stretch;
      height: auto;
    }
    .axis-col.bed .axis-label {
      flex-basis: 100%;
      justify-content: center;
    }
  }

  /* A narrow card (260 px and less, from a desktop's half width down):
     every action below its text at full width, the job's words below its
     picture. A narrow live view: the chips
     go to the bottom, clear of the gear and the close button (chips are
     never cut). */
  @container (max-width: 260px) {
    .live-tags {
      top: auto;
      bottom: 8px;
      /* Clear of the full-screen icon in the corner. */
      right: 46px;
      flex-wrap: wrap-reverse;
    }
    .job {
      flex-wrap: wrap;
      justify-content: center;
    }
    .job-info {
      flex: 1 0 100%;
    }
    .seg button {
      padding: 6px 2px;
      font-size: 12px;
      white-space: normal;
    }
    .ext-buttons {
      flex-direction: column;
    }
    .nozzle-row {
      flex-wrap: wrap;
    }
    .nozzle-row .seg {
      flex: 1 0 100%;
    }
    .ctl-buttons .btn,
    .drying > .btn {
      white-space: normal;
    }
    .det-head {
      flex-wrap: wrap;
      row-gap: 0;
    }
    .det-chevron {
      margin-left: auto;
    }
    .callout {
      padding: 8px 10px;
    }
    .callout > .icon {
      display: none;
    }
    .callout > span {
      flex-basis: 100%;
    }
    .callout .btn {
      padding: 6px 10px;
      white-space: normal;
    }
    /* The backup's "Unknown" under its text, the choice under it. */
    .backup .det-row.choosing .det-text {
      flex: 1 0 100%;
    }
  }

  /* A half-width card on a phone (under 200 px): the name on a row of its
     own in whole words with the chips and the HMS line under it, one
     temperature a row, the tabs as icons. */
  @container (max-width: 200px) {
    .head {
      flex-wrap: wrap;
      row-gap: 6px;
    }
    .names {
      flex: 1 0 100%;
      order: -1;
    }
    .name {
      overflow-wrap: break-word;
    }
    .head .dot {
      margin-right: auto;
    }
    .hms-line-more {
      display: none;
    }
    .tabs {
      margin: 0 8px 4px;
    }
    /* The names do not fit: the tabs show icons, the names stay for a
       screen reader and as a tooltip -- never broken mid-word. */
    .tabs button {
      position: relative;
      min-width: 0;
      display: flex;
      justify-content: center;
      padding: 6px 2px;
    }
    .tabs .tab-icon {
      display: inline-flex;
    }
    /* An AMS head's lines wrap rather than running into the chevron; no
       AMS HT's width here, the unit takes the room there is. */
    .ams-line,
    .ams-env {
      height: auto;
      flex-wrap: wrap;
      row-gap: 2px;
    }
    .ams-fill.with-ht .ams-head {
      min-width: 0;
    }
    /* An AMS unit's colours two a row: the fourth stays in its box. */
    .ams-slots {
      display: grid;
      grid-template-columns: repeat(2, auto);
      justify-content: start;
    }
    button.ams-strip {
      padding-right: 28px;
    }
    .tabs .tab-text {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    .temps,
    .temps.n1,
    .temps.n2,
    .temps.n4,
    .temps.dual {
      grid-template-columns: minmax(0, 1fr);
    }
    .heat-head {
      flex-wrap: wrap;
    }
  }

  /* A thumb gets 44 px for the light, the menu and a heater's off button --
     after the narrow card's smaller steppers, so that it wins there too. */
  @media (pointer: coarse) {
    .head .icon-btn {
      width: 44px;
      height: 44px;
    }
    .heat-row .btn.heat-off {
      width: 44px;
      height: 44px;
      min-height: 44px;
    }
    .heat-row .heat-off-space {
      width: 44px;
      height: 44px;
      min-height: 44px;
    }
    /* With the 44 px buttons beside it the name gets its own row a little
       earlier, in whole words. */
    @container (max-width: 220px) {
      .head {
        flex-wrap: wrap;
        row-gap: 6px;
      }
      .names {
        flex: 1 0 100%;
        order: -1;
      }
      .name {
        overflow-wrap: break-word;
      }
      .head .dot {
        margin-right: auto;
      }
    }
  }

  /* Nothing moves for those who ask their system for less motion. */
  @media (prefers-reduced-motion: reduce) {
    .menu,
    .btn.pending > .icon,
    .icon-btn.pending > .icon,
    .fan.on .icon,
    .ams-activity .icon,
    .activity .icon,
    .activity-bar,
    .check-spinner,
    .sent {
      animation: none;
    }
    .bar span,
    .det-chevron,
    .toggle,
    .toggle .knob,
    .unit-fold {
      transition: none;
    }
  }
`;var jl="bambuddy-printer-card",Ul={status:"infoOutline",control:"tune",filament:"palette"},Wl="hui-dialog-edit-card";function Zl(t){for(let e=t;e;e=e instanceof ShadowRoot?e.host:e.parentNode)if(e instanceof Element&&e.localName===Wl)return!0;return!1}var Gl=["offline","unavailable","unknown"],ql={controls:1,power:2,temperatures:2,ams:2,fans:1,speed:1},Ho="bb-view",Yl=12e3,Eo=3e3,Ro=800,Mo=1e4,Qt=(t,e,n)=>Math.min(n,Math.max(e,t)),ai=t=>t.startsWith("fan."),Jl=15e3,Bo=8,Xl=[".stepper",".heat-set",".heat-row",".heating"],Ql=1500,ed=1e3,td=0,nd=Date.now().toString(36),id=2e3,rd=5e3,Oo=t=>t.composedPath().some(e=>e instanceof HTMLDialogElement&&e.open),li=class extends j{constructor(){super(...arguments);this.preview=!1;this.view="status";this.liveWanted=!1;this.coverLarge=!1;this.jobSpools=new Set;this.fullscreen="off";this.popoverShown=!1;this.fullscreenAsk=0;this.fullscreenAsking=!1;this.fullscreenEntry="";this.pageVisible=document.visibilityState!=="hidden";this.streamFailed=!1;this.pending=new Set;this.sent=!1;this.menuOpen=!1;this.step=1;this.drafts=new Map;this.optionsOpen=!1;this.amsOpen=new Map;this.settings=C;this.streamsLoaded=new Set;this.streamRun=0;this.keyedAt=0;this.asks=0;this.draftTimers=new Map;this.attached=!1;this.inEditor=!1;this.dialogFromMenu=!1;this.dialogBack=void 0;this.asker=void 0;this.onVisibility=()=>{if(this.stopHiddenWait(),document.visibilityState!=="hidden"){this.pageVisible=!0;return}if(!this.fullscreenAsking){this.pageHidden();return}this.hiddenWait=setTimeout(()=>{this.hiddenWait=void 0,this.pageHidden()},ed)};this.onPointerDown=n=>{if(!this.menuOpen)return;let i=this.renderRoot.querySelector(".menu-wrap");i&&!n.composedPath().includes(i)&&(this.menuOpen=!1)};this.startLive=()=>{this.streamFailed=!1,this.coverLarge=!1,this.coverJob=void 0,this.settings.camera==="tap"&&(this.liveWanted=!0),this.focusAfterUpdate(".live .live-close",".live .live-full")};this.toggleCover=()=>{if(this.coverLarge){this.coverLarge=!1,this.coverJob=void 0,this.focusAfterUpdate("button.picture-open");return}this.coverLarge=!0,this.coverJob=this.hass&&this.refs?this.jobOf(this.hass,this.refs):void 0,this.focusAfterUpdate(".big-cover .cover-close")};this.closeLive=()=>{this.stopStream(),this.liveWanted=!1,this.streamFailed=!1,this.focusAfterUpdate("button.live-hint",".btn.live-btn",'.tabs [aria-selected="true"]')};this.toggleFullscreen=()=>{if(this.fullscreen!=="off"){this.leaveFullscreen();return}let n=this.liveElement();if(!n||this.fullscreenAsking)return;this.followFullscreen(!0);let i=++this.fullscreenAsk;if(document.fullscreenEnabled&&typeof n.requestFullscreen=="function"){let r;try{r=n.requestFullscreen()}catch{r=void 0}if(r&&typeof r.then=="function"){this.fullscreenAsking=!0,this.fullscreenWait=setTimeout(()=>this.useWindow(i),Ql),r.then(()=>{clearTimeout(this.fullscreenWait),this.fullscreenAsking=!1,(this.fullscreen==="window"||i!==this.fullscreenAsk)&&document.exitFullscreen().catch(()=>{})},()=>{clearTimeout(this.fullscreenWait),this.fullscreenAsking=!1,this.useWindow(i)});return}}this.useWindow(i)};this.onPopState=()=>{this.ownEntryIsCurrent()||this.leaveFullscreen(!0)};this.onFullscreenChange=()=>{if(this.ownFullscreen()){this.fullscreen==="off"&&this.enterMode("native");return}this.fullscreen==="native"&&this.leaveFullscreen()};this.onFullscreenKey=n=>{if(n.key==="Escape"){if(this.fullscreen!=="window"||Oo(n))return;this.leaveFullscreen();return}n.key!=="Tab"||this.fullscreen==="off"||Oo(n)||(n.preventDefault(),this.renderRoot.querySelector(".live .live-full")?.focus())};this.streamBroke=()=>{this.stopStream(),this.streamFailed=!0};this.setStep=n=>{this.step=n};this.retryLive=()=>{this.streamFailed=!1};this.closeError=()=>{clearTimeout(this.errorTimer),this.error=void 0};this.closeDialog=()=>{let n=this.dialogBack;if(this.dialogBack=void 0,n&&this.dialog&&this.dialog!==n){this.dialog=n;let o=this.asker;this.asker=void 0,this.focusAfterUpdate(...o?[o]:[],"dialog .btn.safe");return}let i=this.dialogFromMenu;this.stopCheckTimer(),this.dialog=void 0,this.dialogFromMenu=!1;let r=this.renderRoot.querySelector("dialog");r?.open&&r.close(),i&&this.focusMenuButton()};this.confirmDialog=()=>{let n=this.dialog;if(n?.kind==="check"){this.runCheck();return}if((this.dialogBack?.kind==="filament"||this.dialogBack?.kind==="hms")&&(this.dialogBack=void 0),this.closeDialog(),!!n)if(n.kind==="confirm"){let[i,r,o]=n.action;this.run(n.key,i,r,o)}else n.kind==="hms"?this.run("clear_hms","button","press",{entity_id:this.refs?.clearHms}):n.kind==="skip"?this.run("skip","bambuddy","skip_objects",{device_id:this.refs?.deviceId,objects:n.chosen}):n.kind==="filament"&&Zt(this.hass,n)?n.chosenSpool!==void 0&&this.run(`filament_${n.entityId}`,"bambuddy","assign_spool",{entity_id:n.entityId,spool_id:n.chosenSpool}):n.kind==="filament"?this.run(`filament_${n.entityId}`,"bambuddy","set_filament",{entity_id:n.entityId,...Wt(n)}):n.kind==="drying"&&this.run(`dry_${n.unit.deviceId}`,"bambuddy","start_drying",{device_id:n.unit.deviceId,temperature:n.temperature,duration:n.duration})};this.dialogActions={close:this.closeDialog,confirm:this.confirmDialog,setDrying:(n,i)=>this.setDrying(n,i),toggleObject:n=>this.toggleObject(n),setVendor:n=>{let i=this.dialog,r=n!==F&&i.keep!==void 0&&Ut(i)===n;this.editFilament({vendor:n,filament:r?F:void 0,kprofile:void 0})},setFilament:n=>{let i={...this.dialog,filament:n};this.editFilament({filament:n,kprofile:n===F?void 0:Yn(i)})},setKProfile:n=>this.editFilament({kprofile:n}),resetSlot:()=>this.resetSlot(),refreshRfid:()=>this.refreshRfid(),setColor:n=>this.editFilament({color:n}),pickColor:n=>this.pickColor(n),copy:n=>{this.copy(n)},confirmTask:n=>this.confirmTask(n),cancel:n=>{if(this.dialogBack){n.preventDefault(),this.closeDialog();return}this.dialog?.kind!=="maintenance"||this.dialog.confirming===void 0||(n.preventDefault(),this.confirmTask(void 0))},markDone:(n,i)=>{this.markDone(n,i)},setTab:n=>{let i=this.dialog;i?.kind!=="filament"||i.tab===n||(this.dialog={...i,tab:n},n==="inventory"&&i.spools===void 0&&this.startSpools(i))},chooseSpool:n=>{let i=this.dialog;i?.kind==="filament"&&(this.dialog={...i,chosenSpool:n})},filterSpools:(n,i)=>{let r=this.dialog;if(r?.kind!=="filament")return;let{vendorFilter:o,materialFilter:a,locationFilter:d,...l}=r,p=n==="vendor"?i:r.vendorFilter,h=n==="material"?i:r.materialFilter,f=n==="location"?i:r.locationFilter;this.dialog={...l,...p?{vendorFilter:p}:{},...h?{materialFilter:h}:{},...f?{locationFilter:f}:{}}},searchSpools:n=>{let i=this.dialog;i?.kind==="filament"&&(this.dialog={...i,search:n})},unassign:()=>{let n=this.dialog;n?.kind==="filament"&&(this.closeDialog(),this.run(`filament_${n.entityId}`,"bambuddy","unassign_spool",{entity_id:n.entityId}))},toggleFold:n=>{let i=this.dialog;if(i?.kind!=="check")return;let r=i.open??[];this.dialog={...i,open:r.includes(n)?r.filter(o=>o!==n):[...r,n]}},now:()=>Date.now()};this.toggleMenu=()=>{this.menuOpen=!this.menuOpen};this.triggerKeys=n=>{n.key==="ArrowDown"&&(n.preventDefault(),this.menuOpen=!0)};this.menuKeys=n=>{if(n.key==="Escape"){n.preventDefault(),n.stopPropagation(),this.closeMenu(!0);return}if(n.key==="Tab"){this.menuOpen=!1;return}let i=this.menuItems().filter(a=>!a.disabled),r=i.indexOf(this.renderRoot.activeElement),o={ArrowDown:r+1,ArrowUp:r-1,Home:0,End:i.length-1};n.key in o&&(n.preventDefault(),i[(o[n.key]+i.length)%i.length]?.focus())}}static{this.properties={hass:{attribute:!1},preview:{type:Boolean},config:{state:!0},view:{state:!0},liveWanted:{state:!0},coverLarge:{state:!0},fullscreen:{state:!0},pageVisible:{state:!0},streamFailed:{state:!0},brokenCover:{state:!0},pending:{state:!0},error:{state:!0},sent:{state:!0},dialog:{state:!0},menuOpen:{state:!0},step:{state:!0},drafts:{state:!0},optionsOpen:{state:!0},amsOpen:{state:!0}}}static{this.styles=Lo}parkDialog(n){this.dialogBack=this.dialog,n?this.asker=n:this.rememberAsker(),this.focusAfterUpdate("dialog .btn.safe")}rememberAsker(){let n=this.renderRoot.activeElement,i=n?.getAttribute("data-answer"),r=n?.getAttribute("aria-label"),o=a=>a.replace(/["\\]/g,"\\$&");this.asker=i?`dialog [data-answer="${o(i)}"]`:r?`dialog [aria-label="${o(r)}"]`:void 0}static async getConfigElement(){return await Co(),document.createElement(ii)}static getStubConfig(n){let i=n?wr(n):[],o=i.find(a=>n&&!Gl.includes(_r(n,a.id)??"unavailable"))??i[0];return o?{printer:o.id}:{}}setConfig(n){this.config=qt(n),this.settings=vo(this.config),this.view=this.settings.startView,this.amsOpen=new Map,this.liveWanted=!1,this.coverLarge=!1,this.coverJob=void 0,this.refs=void 0,this.streamSrc!==void 0&&this.stopStream(),this.streamFailed=!1,this.dialog=void 0,this.dialogFromMenu=!1,this.dialogBack=void 0}getCardSize(){let n=this.hass,i=n?Bn(n,this.refs?.plugs??[]):[];return this.settings.blocks.reduce((r,o)=>r+(o==="power"&&!i.length?0:ql[o]),4)}getGridOptions(){return{columns:12,min_columns:6,rows:"auto"}}endLiveAway(){this.liveGrace=void 0,this.attached=!1,this.leaveFullscreen(),this.stopStream(),this.liveWanted=!1}pageHidden(){this.pageVisible=!1,this.stopStream()}stopHiddenWait(){clearTimeout(this.hiddenWait),this.hiddenWait=void 0}connectedCallback(){super.connectedCallback(),clearTimeout(this.liveGrace),this.liveGrace=void 0,this.pageVisible=document.visibilityState!=="hidden",this.attached=!0,this.inEditor=Zl(this),this.dialog?.kind==="check"&&this.dialog.running&&this.startCheckTimer(),document.addEventListener("visibilitychange",this.onVisibility),document.addEventListener("pointerdown",this.onPointerDown),this.requestUpdate()}disconnectedCallback(){document.removeEventListener("visibilitychange",this.onVisibility),this.stopHiddenWait(),document.removeEventListener("pointerdown",this.onPointerDown),this.menuOpen=!1,this.popoverShown=!1,this.fullscreen==="native"&&(this.fullscreen="window"),this.streamSrc||this.liveWanted||this.fullscreen!=="off"?(clearTimeout(this.liveGrace),this.liveGrace=setTimeout(()=>this.endLiveAway(),id)):this.endLiveAway(),clearTimeout(this.errorTimer),this.followStarting(!1),this.error=void 0,clearTimeout(this.sentTimer),this.sent=!1,clearTimeout(this.copiedTimer),this.stopCheckTimer(),this.dialog?.kind==="info"&&(this.dialog={kind:"info"});for(let[n,i]of this.drafts)i.sentFrom===void 0&&this.sendTarget(n);this.renderRoot.querySelector("dialog")?.removeAttribute("open"),super.disconnectedCallback()}shouldUpdate(n){if(n.size!==1||!n.has("hass"))return!0;let i=n.get("hass"),r=this.hass;return!i||!r||!this.refs||i.entities!==r.entities||i.devices!==r.devices||i.locale!==r.locale||i.localize!==r.localize||i.formatEntityState!==r.formatEntityState||i.config!==r.config||i.user!==r.user?!0:this.refs.watched.some(o=>i.states[o]!==r.states[o])}willUpdate(n){let i=this.hass;if(!(!i||!this.config)){if(Ei(i),(!this.refs||n.has("config")||i.entities!==this.seenEntities||i.devices!==this.seenDevices)&&(this.seenEntities=i.entities,this.seenDevices=i.devices,this.refs=xr(i,this.config.printer)),this.followJobSpools(i),this.coverLarge){let r=this.refs;(!r||this.preview||!Le(i,r)||this.coverUrl(i,r)===void 0||this.jobOf(i,r)!==this.coverJob)&&(this.coverLarge=!1,this.coverJob=void 0,this.liveWanted=!1)}if((this.fullscreen!=="off"||this.fullscreenAsking)&&!this.streaming()&&this.leaveFullscreen(),!this.streaming())this.streamSrc&&this.stopStream();else{let r=this.frameRate();if(this.streamSrc&&r!==void 0&&r!==this.streamFps&&this.stopStream(),!this.streamSrc){this.streamFps=r;let o=this.streamUrl();this.streamSrc=this.streamsLoaded.has(o)?`${o}&run=${++this.streamRun}`:o,this.streamsLoaded.add(o)}}for(let[r,o]of this.drafts){let a=i.states[r]?.state;o.wish&&(o.moved||=a!==o.sentFrom),(o.wish?a!=="on"&&a!=="off"||a===o.wish&&o.moved===!0:o.sentFrom!==void 0&&this.draftMark(r)!==o.sentFrom)&&this.dropDraft(r)}}}followStarting(n){n&&!this.startingTimer&&(this.startingTimer=setInterval(()=>this.requestUpdate(),1e3)),!n&&this.startingTimer&&(clearInterval(this.startingTimer),this.startingTimer=void 0)}firstUpdated(n){super.firstUpdated(n),this.renderRoot.addEventListener("focusin",i=>{let r=i.composedPath()[0];this.focusedLast=r instanceof HTMLElement?r:void 0}),this.renderRoot.addEventListener("keydown",()=>{this.keyedAt=Date.now()})}updated(n){super.updated(n),this.keepKeyboardPlace(),n.has("menuOpen")&&this.menuOpen&&(this.placeMenu(),this.menuItems()[0]?.focus());let i=this.renderRoot.querySelector("dialog");i&&!i.open&&this.isConnected&&(typeof i.showModal=="function"?i.showModal():i.setAttribute("open",""),i.querySelector(".dlg-actions .safe")?.focus({preventScroll:!0}),i.scrollTop=0);let r=i?.open?i.querySelector(".dlg-actions"):null;i&&r&&(i.style.scrollPaddingBottom=`${r.offsetHeight+12}px`);let o=this.liveElement();if(this.fullscreen==="window"&&!this.popoverShown&&o?.hasAttribute("popover"))try{o.showPopover(),this.popoverShown=!0}catch{}}keepKeyboardPlace(){if(!this.isConnected)return;let n=this.focusedLast;if(!n||Date.now()-this.keyedAt>Jl)return;let i=this.renderRoot.activeElement;if(i&&i!==n)return;let r=document.activeElement;if(!i&&r!==null&&r!==document.body&&r!==this)return;if(n.isConnected&&!n.disabled){!i&&this.renderRoot.querySelector("dialog[open]")&&n.focus();return}this.focusedLast=void 0;let o="button:not([disabled]), input:not([disabled])",a=n.isConnected?Xl.map(l=>n.closest(l)?.querySelector(o)).find(Boolean):void 0,d=this.renderRoot.querySelector("dialog[open] .dlg-actions .safe");(a??d??this.renderRoot.querySelector('.tabs [aria-selected="true"]')??this.renderRoot.querySelector(".menu-btn"))?.focus()}placeMenu(){let n=this.renderRoot.querySelector(".menu");if(!n)return;n.style.translate="";let i=n.getBoundingClientRect();if(!i.width)return;let r=Math.max(Bo-i.left,0)+Math.min(window.innerWidth-Bo-i.right,0);n.style.translate=r?`${r}px 0`:""}cameraToken(){let n=this.refs?.camera;if(!(!this.hass||!n||!R(this.hass,n)))return ye(v(this.hass,n)?.attributes.access_token)}streaming(){return this.settings.camera==="off"||this.coverLarge||this.preview||!this.attached||!this.pageVisible||this.streamFailed||!this.refs||!this.cameraToken()?!1:this.settings.camera==="always"||this.liveWanted}frameRate(n=!1){let i=this.refs?.camera?v(this.hass,this.refs.camera)?.attributes[n?"streamed_frame_rate":"frame_rate"]:void 0;return typeof i=="number"?i:void 0}streamUrl(){let n=this.streamFps===void 0?"":`&fps=${this.streamFps}`;return`/api/camera_proxy_stream/${this.refs?.camera}?token=${encodeURIComponent(this.cameraToken()??"")}${n}`}stopStream(){for(let n of this.renderRoot.querySelectorAll("img.stream"))n.removeAttribute("src");this.streamSrc=void 0}liveOffered(n){let i=this.settings.camera;return i==="off"||!n||this.preview||this.cameraToken()===void 0?!1:this.coverLarge||i==="tap"&&!this.liveWanted}coverUrl(n,i){let r=v(n,i.cover),o=r&&R(n,i.cover)?r.attributes.entity_picture:void 0,a=Le(n,i)?v(n,i.status)?.state??"unknown":"offline";return typeof o=="string"&&o!==this.brokenCover&&ct.has(a)?o:void 0}followJobSpools(n){let i=this.refs,r=i&&Le(n,i)&&Y.has(v(n,i.status)?.state??"")?this.jobOf(n,i)??"":void 0;if(r!==this.spoolJob&&(this.spoolJob=r,this.jobSpools=new Set),!i||r===void 0)return;let o=i.externalSpools.filter(a=>!this.jobSpools.has(a)&&L(n,a).active);o.length&&(this.jobSpools=new Set([...this.jobSpools,...o]))}jobOf(n,i){return v(n,i.job)?.state}focusAfterUpdate(...n){this.updateComplete.then(()=>{for(let i of n){let r=this.renderRoot.querySelector(i);if(r)return r.focus()}})}liveElement(){return this.renderRoot.querySelector(".live")}ownFullscreen(){let n=this.liveElement();return n!==null&&this.renderRoot.fullscreenElement===n}useWindow(n){n===this.fullscreenAsk&&(this.fullscreenAsking=!1,this.fullscreen==="off"&&this.isConnected&&this.enterMode("window"))}enterMode(n){this.fullscreen=n,this.fullscreenEntry=`${nd}-${++td}`,history.pushState({bambuddyFullscreen:this.fullscreenEntry},""),window.addEventListener("popstate",this.onPopState),this.focusAfterUpdate(".live .live-full")}ownEntryIsCurrent(){return history.state?.bambuddyFullscreen===this.fullscreenEntry}followFullscreen(n){n?(document.addEventListener("fullscreenchange",this.onFullscreenChange),document.addEventListener("keydown",this.onFullscreenKey)):(document.removeEventListener("fullscreenchange",this.onFullscreenChange),document.removeEventListener("keydown",this.onFullscreenKey))}leaveFullscreen(n=!1){if(window.removeEventListener("popstate",this.onPopState),!n&&this.fullscreen!=="off"&&this.ownEntryIsCurrent()&&history.back(),this.fullscreen="off",this.fullscreenAsk+=1,this.fullscreenAsking=!1,clearTimeout(this.fullscreenWait),this.followFullscreen(!1),this.popoverShown){this.popoverShown=!1;try{this.liveElement()?.hidePopover()}catch{}}this.ownFullscreen()&&document.exitFullscreen().catch(()=>{}),this.liveElement()?.matches(":focus-within")&&this.focusAfterUpdate(".live .live-full",".live.failed .btn","button.live-hint",'.tabs [aria-selected="true"]')}async run(n,i,r,o){let a=this.hass;if(!a||this.pending.has(n))return!1;let d=this.renderRoot.activeElement;this.pending=new Set([...this.pending,n]),d&&this.dialog&&this.updateComplete.then(()=>{d.disabled&&this.renderRoot.querySelector("dialog .btn.safe")?.focus()});try{return await un(a,i,r,o),this.showSent(),n.startsWith("hms_")&&this.dialog?.kind==="hms"&&this.closeDialog(),!0}catch(l){return this.showError(await Ie(a,l)),!1}finally{this.pending=new Set([...this.pending].filter(l=>l!==n))}}targetOf(n){return this.drafts.get(n)?.value??this.reported(n)}reported(n){let i=this.hass;if(!ai(n))return S(i,n);let r=i.states[n];if(!r||r.state==="unavailable"||r.state==="unknown")return;let o=r.attributes.percentage;return typeof o=="number"?o:0}draftMark(n){let i=this.hass.states[n];return ai(n)?String(i?.attributes.percentage??0):i?.state??""}setDraft(n,i){this.drafts=new Map([...this.drafts,[n,i]])}dropDraft(n){clearTimeout(this.draftTimers.get(n)),this.draftTimers.delete(n);let i=new Map(this.drafts);i.delete(n),this.drafts=i}later(n,i,r){clearTimeout(this.draftTimers.get(n)),this.draftTimers.set(n,setTimeout(r,i))}stepTarget(n,i){this.setDraft(n,{value:i}),this.later(n,Ro,()=>{this.sendTarget(n)})}async sendTarget(n){let i=this.drafts.get(n),r=`target_${n}`;if(this.pending.has(r)){this.later(n,Ro,()=>{this.sendTarget(n)});return}this.setDraft(n,{value:i.value,sentFrom:this.draftMark(n)}),this.later(n,Mo,()=>this.dropDraft(n)),!(ai(n)?await this.run(r,"fan","set_percentage",{entity_id:n,percentage:i.value}):await this.run(r,"number","set_value",{entity_id:n,value:i.value}))&&this.drafts.get(n)?.sentFrom!==void 0&&this.dropDraft(n)}switchOn(n){let i=this.drafts.get(n);return i?i.value===1:v(this.hass,n).state==="on"}async toggleSwitch(n,i="switch",r=`switch_${n}`){if(this.pending.has(r))return;let o=!this.switchOn(n),a=v(this.hass,n).state;this.setDraft(n,{value:o?1:0,sentFrom:a,wish:o?"on":"off"}),this.later(n,Mo,()=>this.dropDraft(n)),await this.run(r,i,o?"turn_on":"turn_off",{entity_id:n})||this.dropDraft(n)}setTargets(n){for(let[i,r]of n)this.setDraft(i,{value:r}),this.sendTarget(i)}showError(n){this.error=n,clearTimeout(this.errorTimer),this.errorTimer=setTimeout(()=>{this.error=void 0},Yl)}showSent(){this.closeError(),this.sent=!0,clearTimeout(this.sentTimer),this.sentTimer=setTimeout(()=>{this.sent=!1},Eo)}dropSent(){clearTimeout(this.sentTimer),this.sent=!1}moreInfo(n){n&&this.dispatchEvent(new CustomEvent("hass-more-info",{bubbles:!0,composed:!0,detail:{entityId:n}}))}openDrying(n){let i=this.hass,r=n.model==="AMS 2 Pro"?B.maxTemperatureAms2Pro:B.maxTemperature,o=n.slots.map(f=>L(i,f)).filter(f=>!f.empty&&!f.unknown),a=(f,g)=>{let _=v(i,f.entityId).attributes[g];return typeof _=="number"&&_>0?Math.round(_):void 0},d=new Map;for(let f of o){let g=a(f,"drying_temp"),_=f.type||f.name;g!==void 0&&d.set(`${_} ${g}`,{material:_,temperature:g})}let l=[...d.values()].sort((f,g)=>f.temperature-g.temperature),p=l.map(f=>f.temperature),h=o.map(f=>a(f,"drying_time")).filter(f=>f!==void 0);this.dialog={kind:"drying",unit:n,temperature:Qt(p[0]??B.temperature,B.minTemperature,r),duration:Qt(h.length?Math.max(...h):B.duration,B.minDuration,B.maxDuration),maxTemperature:r,suggested:p.length>0||h.length>0,...l.length?{suggestedFor:[...new Set(l.map(f=>f.material))].join(", ")}:{},differing:new Set(p).size>1?l:[]}}async openSkip(){let n=this.hass,i=this.refs.deviceId,r={kind:"skip",loading:!0,objects:[],chosen:[]};this.dialog=r;let o;try{o={...r,loading:!1,objects:await Fi(n,i)}}catch(a){let d=await Ie(n,a);o={...r,loading:!1,error:d}}this.dialog===r&&(this.dialog=o)}toggleObject(n){let i=this.dialog;if(i?.kind!=="skip")return;let r=i.chosen.includes(n)?i.chosen.filter(a=>a!==n):[...i.chosen,n],o=i.objects.map(a=>a.id);this.dialog={...i,chosen:r.sort((a,d)=>o.indexOf(a)-o.indexOf(d))}}openFilament(n,i,r=!1){let o=this.hass,a=this.refs,d=n.type?n.name:void 0,l=n.color?.toUpperCase(),p={kind:"filament",entityId:n.entityId,title:i,...d?{keep:d,vendor:F}:{},...l?{current:l,color:l,...qn(l)?{}:{custom:l}}:{},rfid:n.rfid,...n.empty?{empty:!0}:{},ams:!a.externalSpools.includes(n.entityId),active:n.active,...n.rfid?{spool:[n.name,n.remaining===void 0?"":z(o,n.remaining)].filter(Boolean).join(" \xB7 ")}:{},...n.rfid||r?{}:{kprofiles:"loading",offer:"loading"},...r?{inventoryOnly:!0,tab:"inventory"}:{},ask:++this.asks};if(this.dialog=p,clearTimeout(this.kSlowTimer),r&&n.assignable&&this.startSpools(p),!n.rfid&&!r){let h=p.ask;this.loadOffer(n.entityId,h),this.loadKProfiles(n.entityId,h),this.kSlowTimer=setTimeout(()=>this.markKSlow(n.entityId,h),rd)}}startSpools(n){let i=n.ask;this.isAsk(this.dialog,n.entityId,i)&&(this.dialog={...this.dialog,spools:"loading"}),this.loadSpools(n.entityId,i)}async loadSpools(n,i){let r="failed";for(let l=0;l<2&&r==="failed";l+=1)try{r=await Oi(this.hass,n)??"failed"}catch{r="failed"}let o=l=>{let p=typeof r=="object"?r:void 0,h=l.chosenSpool??p?.assigned;return{...l,spools:r,...h!==void 0?{chosenSpool:h}:{}}},a=this.dialog;this.isAsk(a,n,i)&&(this.dialog=o(a),this.updateComplete.then(()=>this.renderRoot.querySelector('dialog .inv-row[aria-checked="true"]')?.scrollIntoView?.({block:"nearest"})));let d=this.dialogBack;this.isAsk(d,n,i)&&(this.dialogBack=o(d))}markKSlow(n,i){let r=d=>d.kprofiles==="loading"?{...d,kSlow:!0}:d,o=this.dialog;this.isAsk(o,n,i)&&(this.dialog=r(o));let a=this.dialogBack;this.isAsk(a,n,i)&&(this.dialogBack=r(a))}isAsk(n,i,r){return n?.kind==="filament"&&n.entityId===i&&n.ask===r}async loadOffer(n,i){let r;try{r=await Mi(this.hass,n)??"failed"}catch{r="failed"}let o=l=>{let p={...l,offer:r},h=Ut(p);return l.vendor===F&&h!==void 0?{...p,vendor:h,filament:F}:p},a=this.dialog;this.isAsk(a,n,i)&&(this.dialog=o(a));let d=this.dialogBack;this.isAsk(d,n,i)&&(this.dialogBack=o(d))}async loadKProfiles(n,i){let r;try{r=await Ri(this.hass,n)}catch{r="failed"}let o=l=>{let p={...l,kprofiles:r};return l.filament!==void 0&&l.filament!==F&&l.kprofile===void 0?{...p,kprofile:Yn(p)}:p},a=this.dialog;this.isAsk(a,n,i)&&(this.dialog=o(a));let d=this.dialogBack;this.isAsk(d,n,i)&&(this.dialogBack=o(d))}resetSlot(){let n=this.dialog;if(n?.kind!=="filament")return;let i=this.hass;this.parkDialog(),this.dropSent();let r=v(i,this.refs.status)?.state,o=!n.ams,a=s(i,o?"reset_text_spool":"reset_text"),d=s(i,o?"reset_in_use_spool":"reset_in_use");this.dialog={kind:"confirm",title:s(i,o?"reset_title_spool":"reset_title"),text:n.active&&r==="paused"?`${a} ${d}`:a,confirm:s(i,"reset_confirm"),danger:!0,action:["bambuddy","reset_slot",{entity_id:n.entityId}],key:`reset_${n.entityId}`}}refreshRfid(){let n=this.dialog;n?.kind==="filament"&&(this.closeDialog(),this.run(`rfid_${n.entityId}`,"bambuddy","refresh_rfid",{entity_id:n.entityId}))}editFilament(n){this.dialog={...this.dialog,...n}}pickColor(n){let i=n.toUpperCase();this.editFilament({color:i,...qn(i)?{}:{custom:i}})}async copy(n){try{await navigator.clipboard.writeText(n)}catch{return}this.dialog?.kind==="info"&&(this.dialog={...this.dialog,copied:!0},clearTimeout(this.copiedTimer),this.copiedTimer=setTimeout(()=>{this.dialog?.kind==="info"&&(this.dialog={kind:"info"})},Eo))}setDrying(n,i){let r=this.dialog;if(!Number.isFinite(i))return r[n];let o=n==="temperature"?Qt(Math.round(i),B.minTemperature,r.maxTemperature):Qt(Math.round(i),B.minDuration,B.maxDuration);return this.dialog={...r,[n]:o},o}confirmTask(n){let i=this.dialog;if(i?.kind!=="maintenance")return;let r=i.marking!==void 0?{marking:i.marking}:{};this.dialog=n===void 0?{kind:"maintenance",...r}:{kind:"maintenance",...r,confirming:n},n!==void 0?(this.dropSent(),this.focusAfterUpdate(".maint-confirm .btn.plain")):i.confirming!==void 0&&this.focusAfterUpdate(`.maint-done[data-task="${i.confirming}"]`)}async markDone(n,i){let r=this.hass,o=this.dialog?.kind==="maintenance"?this.dialog.marking??[]:[];this.dialog={kind:"maintenance",marking:[...o,n]};let a;try{await un(r,"bambuddy","mark_maintenance_done",{device_id:this.refs?.deviceId,task_id:n})}catch(h){a=await Ie(r,h)}if(this.dialog?.kind!=="maintenance"||!this.dialog.marking?.includes(n))return;let d=this.dialog.confirming,l=this.dialog.marking.filter(h=>h!==n),p=a??this.dialog.error;this.dialog={kind:"maintenance",...l.length?{marking:l}:{},...d===void 0?{}:{confirming:d},...p===void 0?{}:{error:p},...a===void 0?{marked:i}:{}},d===void 0&&this.focusAfterUpdate(`.maint-done[data-task="${n}"]`,"dialog .btn.safe")}async runCheck(){let n=this.hass,i=this.refs.deviceId,r={kind:"check",running:!0,started:Date.now()};this.dialog=r,this.startCheckTimer(),this.focusAfterUpdate("dialog .btn.safe");let o;try{o={...r,running:!1,result:await ar(n,i)}}catch(a){o={...r,running:!1,error:await Ie(n,a)}}this.dialog===r&&(this.stopCheckTimer(),this.dialog=o)}startCheckTimer(){this.stopCheckTimer(),this.checkTimer=setInterval(()=>this.requestUpdate(),1e3)}stopCheckTimer(){clearInterval(this.checkTimer),this.checkTimer=void 0}menuItems(){return[...this.renderRoot.querySelectorAll(".menu [role=menuitem]")]}focusMenuButton(){this.focusAfterUpdate(".menu-btn")}closeMenu(n){this.menuOpen=!1,n&&this.focusMenuButton()}editDevice(n){history.pushState(null,"",`/config/devices/device/${n}`),window.dispatchEvent(new CustomEvent("location-changed",{detail:{replace:!1}}))}menu(n){let{hass:i,refs:r}=n,o=(d,l,p,h=!1,f=!1)=>c`<button
        role="menuitem"
        tabindex="-1"
        aria-haspopup=${f?"dialog":u}
        ?disabled=${h}
        @click=${()=>{this.closeMenu(!f),f&&(this.dialogFromMenu=!0),p()}}
      >
        ${b(d)}<span>${s(i,l)}</span>
      </button>`,a=r.refresh;return c`<span class="menu-wrap">
      <button
        class="icon-btn menu-btn"
        aria-label=${s(i,"more")}
        title=${s(i,"more")}
        aria-haspopup="menu"
        aria-expanded=${this.menuOpen?"true":"false"}
        aria-controls="bb-menu"
        @click=${this.toggleMenu}
        @keydown=${this.triggerKeys}
      >
        ${b("dotsVertical")}
      </button>
      ${this.menuOpen?c`<div class="menu" id="bb-menu" role="menu" aria-label=${s(i,"more")} @keydown=${this.menuKeys}>
            ${i.user?.is_admin?o("openInNew","menu_device_page",()=>this.editDevice(r.deviceId)):u}
            ${o("infoOutline","menu_info",()=>{this.dialog={kind:"info"}},!1,!0)}
            ${Bt(n)?o("wrench","menu_maintenance",()=>{this.dialog={kind:"maintenance"}},!1,!0):u}
            ${a?o("refresh","menu_refresh",()=>{this.run("refresh","button","press",{entity_id:a})},v(i,a)?.state==="unavailable"||this.pending.has("refresh")):u}
            ${o("lan","check_connection",()=>{this.runCheck()},n.unreachable,!0)}
          </div>`:u}
    </span>`}context(n,i){let r=Le(n,i),o=v(n,i.status)?.state??"unknown",a=r?o:"offline",d=o==="unavailable",l=d&&$r(n,i),p=kr(i),h=this.settings,f=p&&!h.readOnly,g=Sr(n,i),_=g.length;return{hass:n,settings:h,refs:i,ams:g,status:a,online:r,unreachable:d,missing:l,busy:Y.has(a),running:Ii.has(a),changing:r&&Ki.has(v(n,i.amsStatus)?.state??""),canControl:f,viewOnly:h.readOnly&&p,examples:this.preview&&this.inEditor,controlTab:h.controlTab&&p&&h.sections.some(m=>tr(i,m,h.readOnly)),filamentTab:h.filamentTab&&(_>0||i.externalSpools.length>0),jobSpools:this.jobSpools,...this.liveOffered(r)?{startLive:this.startLive}:{},isPending:m=>this.pending.has(m),run:(m,y,w,k)=>{this.run(m,y,w,k)},confirm:m=>{this.dialog?.kind==="power"||this.dialog?.kind==="hms"?this.parkDialog():this.dialogBack=void 0,this.dropSent(),this.dialog={kind:"confirm",...m}},dry:m=>this.openDrying(m),setFilament:(m,y,w)=>this.openFilament(m,y,w),skip:()=>{this.openSkip()},targetOf:m=>this.targetOf(m),stepTarget:(m,y)=>this.stepTarget(m,y),setTargets:m=>this.setTargets(m),switchOn:m=>this.switchOn(m),toggleSwitch:m=>{this.toggleSwitch(m)},optionsOpen:this.optionsOpen,toggleOptions:()=>{this.optionsOpen=!this.optionsOpen},amsUnfolded:m=>this.amsOpen.get(m.deviceId)??(h.amsFolding==="open"||h.amsFolding==="auto"&&_<3),toggleAms:(m,y)=>{this.amsOpen=new Map(this.amsOpen).set(m.deviceId,y)},moreInfo:m=>this.moreInfo(m),show:m=>{this.view=m},checkConnection:()=>{this.dialogFromMenu=!1,this.runCheck()},openAutoOff:()=>{this.dialog?.kind==="power"?this.parkDialog("dialog .p-open"):this.dialogBack=void 0,this.dialog={kind:"auto_off"},this.dialogFromMenu=!1}}}views(n){return["status",...n.controlTab?["control"]:[],...n.filamentTab?["filament"]:[]]}header(n){let{hass:i,refs:r}=n,o=r.light?v(i,r.light):void 0,a=r.light&&o?this.switchOn(r.light):!1,d=r.plainLight?"light_plain":"light",l=K(n),p=Wr(n),h=f=>{this.dialog={kind:f},this.dialogFromMenu=!1};return c`<div class="head">
      <span class="dot ${n.online?"on":""}" role="img" aria-label=${s(i,$e(n))} title=${s(i,$e(n))}></span>
      <div class="names">
        <div class="name" role="heading" aria-level="2" title=${l}>${l}</div>
        ${p?c`<div class="model">${p}</div>`:u}
      </div>
      ${r.light&&n.canControl?c`<button
            class="icon-btn light ${a?"on":""} ${this.pending.has("light")?"pending":""}"
            aria-label=${s(i,d)}
            title=${s(i,d)}
            aria-pressed=${a?"true":"false"}
            aria-busy=${this.pending.has("light")?"true":"false"}
            aria-disabled=${this.pending.has("light")?"true":u}
            ?disabled=${!n.online||o?.state==="unavailable"}
            @click=${()=>{this.toggleSwitch(r.light,"light","light")}}
          >
            ${b(a?"lightOn":"lightOff")}
          </button>`:r.light&&n.viewOnly?c`<span
              class="icon-btn light state ${a?"on":""}"
              role="img"
              aria-label="${s(i,d)}: ${s(i,a?"on":"off")}"
              title="${s(i,d)}: ${s(i,a?"on":"off")}"
              >${b(a?"lightOn":"lightOff")}</span
            >`:u}
      ${this.menu(n)}
    </div>
    ${Qr(n,h)}`}tabs(n,i){if(n.length<2)return u;let r=this.hass,o=d=>{this.view=d},a=d=>{let l=n.indexOf(i),p={ArrowRight:l+1,ArrowLeft:l-1,Home:0,End:n.length-1};d.key in p&&(d.preventDefault(),o(n[(p[d.key]+n.length)%n.length]),this.updateComplete.then(()=>this.renderRoot.querySelector('.tabs [aria-selected="true"]')?.focus()))};return c`<div class="tabs" role="tablist" aria-label=${s(r,"aria_views")} @keydown=${a}>
      ${n.map(d=>c`<button
          role="tab"
          id="tab-${d}"
          aria-selected=${d===i?"true":"false"}
          aria-controls=${Ho}
          tabindex=${d===i?0:-1}
          title=${s(r,`tab_${d}`)}
          @click=${()=>o(d)}
        >
          <span class="tab-icon" aria-hidden="true">${b(Ul[d])}</span><span class="tab-text">${s(r,`tab_${d}`)}</span>
        </button>`)}
    </div>`}picture(n){let{hass:i,refs:r}=n,o=this.coverUrl(i,r),a=o!==void 0?c`<img
            class="cover"
            src=${o}
            alt=""
            @error=${()=>{this.brokenCover=o}}
          />`:Ui(),d=o!==void 0&&!this.preview;if(!d&&!n.startLive)return c`<div class="picture ${n.online?"":"offline-pic"}">${a}</div>`;let l=this.coverLarge;return c`<div class="picture">
      ${d?c`<button
            class="picture-open"
            aria-label=${s(i,"cover_open")}
            title=${s(i,l?"cover_close":"cover_open")}
            aria-pressed=${l?"true":"false"}
            @click=${this.toggleCover}
          >
            ${a}
          </button>`:a}
      ${n.startLive?c`<button class="live-hint" aria-label=${s(i,"live")} title=${s(i,"live")} @click=${n.startLive}>${b("video")}</button>`:u}
    </div>`}livePanel(){let n=this.hass,i=this.coverLarge&&this.refs?this.coverUrl(n,this.refs):void 0;if(i!==void 0)return c`<div class="big-cover">
        <img
          src=${i}
          alt=""
          @error=${()=>{this.brokenCover=i}}
        />
        <div class="live-tools">
          <button class="icon-btn cover-close" aria-label=${s(n,"cover_close")} title=${s(n,"cover_close")} @click=${this.toggleCover}>
            ${b("close")}
          </button>
        </div>
      </div>`;let o=this.settings.camera==="tap"?c`<button class="icon-btn live-close" aria-label=${s(n,"live_stop")} title=${s(n,"live_stop")} @click=${this.closeLive}>
          ${b("close")}
        </button>`:u;if(this.streamFailed&&(this.liveWanted||this.settings.camera==="always"))return c`<div class="live failed" role="status">
        ${b("videoOff")}<span>${s(n,"camera_failed")}</span>
        <button class="btn" @click=${this.retryLive}>${s(n,"retry")}</button>
        <div class="live-tools">${o}</div>
      </div>`;if(!this.streamSrc)return u;let a=this.refs?.cameraFps,d=a?n.states[a]:void 0,l=d&&d.state!=="unavailable"&&!this.settings.readOnly?c`<button
            class="icon-btn live-fps-open"
            aria-label=${s(n,"fps_open")}
            title=${s(n,"fps_open")}
            aria-haspopup="dialog"
            @click=${()=>{this.dialogBack=void 0,this.dialog={kind:"camera"},this.dialogFromMenu=!1}}
          >
            ${b("cog")}
          </button>`:u,p=this.frameRate(!0),h=p===void 0?void 0:T(n,p,1),f=h===void 0?s(n,"fps_measuring"):s(n,"fps_aria",{fps:h}),g=this.fullscreen!=="off",_=s(n,g?"fullscreen_close":"fullscreen_open"),m=this.fullscreen==="window"&&typeof HTMLElement.prototype.showPopover=="function"?"manual":u;return c`${g?c`<div class="live-holder"></div>`:u}<div class="live ${g?"full":""}" popover=${m}>
      <img class="stream" src=${this.streamSrc} alt=${s(n,"live")} @error=${this.streamBroke} />
      <div class="live-tags">
        <span class="live-badge">${s(n,"live_badge")}</span>
        <span class="live-badge live-fps" role="img" aria-label=${f} title=${f}>${s(n,"fps_value",{fps:h??"\u2013"})}</span>
      </div>
      <div class="live-tools">${l}${o}</div>
      <button class="icon-btn live-full" aria-label=${_} title=${_} @click=${this.toggleFullscreen}>
        ${b(g?"fullscreenExit":"fullscreen")}
      </button>
    </div>`}errorLine(){let n=this.hass;return this.error?c`<div class="toast" role="alert">
      ${b("error")}<span>${this.error}</span>
      <button class="icon-btn" aria-label=${s(n,"error_dismiss")} title=${s(n,"error_dismiss")} @click=${this.closeError}>${b("close")}</button>
    </div>`:this.sent?gt("sent-slot",s(n,"sent")):u}render(){let n=this.hass,i=this.config;if(!n||!i)return u;let r=this.refs;if(!r){let h=i.printer?n.devices[i.printer]:void 0,f=i.printer?h?br(h)?"waiting_for_printer":"not_a_printer":"not_found":"no_printer";return c`<ha-card><div class="message">${s(n,f)}</div></ha-card>`}let o=this.context(n,r);this.followStarting(On(o)!==void 0);let a=this.views(o),d=a.includes(this.view)?this.view:"status",l;!o.online&&d!=="status"?l=o.examples?mt(o,ft(o),d==="control"?$n(je(o),this.step,this.setStep):Jn(je(o))):si(o,this.picture(o)):d==="control"?l=$n(o,this.step,this.setStep):d==="filament"?l=Jn(o):l=Do(o,this.picture(o));let p=a.length>1;return c`<ha-card>
      <div class="card-status sr-only" role="status" aria-atomic="true">${K(o)}: ${o.online?oi(o,!0):s(n,$e(o))}</div>
      ${this.header(o)}${this.tabs(a,d)}${this.livePanel()}
      <div
        class="body"
        role=${p?"tabpanel":u}
        id=${p?Ho:u}
        aria-labelledby=${p?`tab-${d}`:u}
      >
        ${l}
      </div>
      ${this.dialog?go(o,this.dialog,this.dialogActions,this.errorLine()):this.errorLine()}
    </ha-card>`}};ri(ii,Jt);To(jl,li,{name:()=>s(void 0,"picker_name"),description:()=>s(void 0,"picker_description")});
/*! Bundled license information:

@lit/reactive-element/css-tag.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/reactive-element.js:
lit-html/lit-html.js:
lit-element/lit-element.js:
lit-html/directive.js:
lit-html/directives/repeat.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/is-server.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/directive-helpers.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/directives/keyed.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
