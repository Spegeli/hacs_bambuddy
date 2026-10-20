var Fe=globalThis,Ve=Fe.ShadowRoot&&(Fe.ShadyCSS===void 0||Fe.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,Pt=Symbol(),Fn=new WeakMap,ke=class{constructor(e,n,i){if(this._$cssResult$=!0,i!==Pt)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=n}get styleSheet(){let e=this.o,n=this.t;if(Ve&&e===void 0){let i=n!==void 0&&n.length===1;i&&(e=Fn.get(n)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),i&&Fn.set(n,e))}return e}toString(){return this.cssText}},Vn=t=>new ke(typeof t=="string"?t:t+"",void 0,Pt),$e=(t,...e)=>{let n=t.length===1?t[0]:e.reduce((i,r,a)=>i+(s=>{if(s._$cssResult$===!0)return s.cssText;if(typeof s=="number")return s;throw Error("Value passed to 'css' function must be a 'css' function result: "+s+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(r)+t[a+1],t[0]);return new ke(n,t,Pt)},In=(t,e)=>{if(Ve)t.adoptedStyleSheets=e.map(n=>n instanceof CSSStyleSheet?n:n.styleSheet);else for(let n of e){let i=document.createElement("style"),r=Fe.litNonce;r!==void 0&&i.setAttribute("nonce",r),i.textContent=n.cssText,t.appendChild(i)}},Ot=Ve?t=>t:t=>t instanceof CSSStyleSheet?(e=>{let n="";for(let i of e.cssRules)n+=i.cssText;return Vn(n)})(t):t;var{is:sa,defineProperty:la,getOwnPropertyDescriptor:da,getOwnPropertyNames:ca,getOwnPropertySymbols:pa,getPrototypeOf:ua}=Object,Ie=globalThis,Kn=Ie.trustedTypes,ha=Kn?Kn.emptyScript:"",ma=Ie.reactiveElementPolyfillSupport,Ce=(t,e)=>t,Bt={toAttribute(t,e){switch(e){case Boolean:t=t?ha:null;break;case Object:case Array:t=t==null?t:JSON.stringify(t)}return t},fromAttribute(t,e){let n=t;switch(e){case Boolean:n=t!==null;break;case Number:n=t===null?null:Number(t);break;case Object:case Array:try{n=JSON.parse(t)}catch{n=null}}return n}},jn=(t,e)=>!sa(t,e),Un={attribute:!0,type:String,converter:Bt,reflect:!1,useDefault:!1,hasChanged:jn};Symbol.metadata??=Symbol("metadata"),Ie.litPropertyMetadata??=new WeakMap;var I=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??=[]).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,n=Un){if(n.state&&(n.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((n=Object.create(n)).wrapped=!0),this.elementProperties.set(e,n),!n.noAccessor){let i=Symbol(),r=this.getPropertyDescriptor(e,i,n);r!==void 0&&la(this.prototype,e,r)}}static getPropertyDescriptor(e,n,i){let{get:r,set:a}=da(this.prototype,e)??{get(){return this[n]},set(s){this[n]=s}};return{get:r,set(s){let d=r?.call(this);a?.call(this,s),this.requestUpdate(e,d,i)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??Un}static _$Ei(){if(this.hasOwnProperty(Ce("elementProperties")))return;let e=ua(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(Ce("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(Ce("properties"))){let n=this.properties,i=[...ca(n),...pa(n)];for(let r of i)this.createProperty(r,n[r])}let e=this[Symbol.metadata];if(e!==null){let n=litPropertyMetadata.get(e);if(n!==void 0)for(let[i,r]of n)this.elementProperties.set(i,r)}this._$Eh=new Map;for(let[n,i]of this.elementProperties){let r=this._$Eu(n,i);r!==void 0&&this._$Eh.set(r,n)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){let n=[];if(Array.isArray(e)){let i=new Set(e.flat(1/0).reverse());for(let r of i)n.unshift(Ot(r))}else e!==void 0&&n.push(Ot(e));return n}static _$Eu(e,n){let i=n.attribute;return i===!1?void 0:typeof i=="string"?i:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(e=>this.enableUpdating=e),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(e=>e(this))}addController(e){(this._$EO??=new Set).add(e),this.renderRoot!==void 0&&this.isConnected&&e.hostConnected?.()}removeController(e){this._$EO?.delete(e)}_$E_(){let e=new Map,n=this.constructor.elementProperties;for(let i of n.keys())this.hasOwnProperty(i)&&(e.set(i,this[i]),delete this[i]);e.size>0&&(this._$Ep=e)}createRenderRoot(){let e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return In(e,this.constructor.elementStyles),e}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach(e=>e.hostConnected?.())}enableUpdating(e){}disconnectedCallback(){this._$EO?.forEach(e=>e.hostDisconnected?.())}attributeChangedCallback(e,n,i){this._$AK(e,i)}_$ET(e,n){let i=this.constructor.elementProperties.get(e),r=this.constructor._$Eu(e,i);if(r!==void 0&&i.reflect===!0){let a=(i.converter?.toAttribute!==void 0?i.converter:Bt).toAttribute(n,i.type);this._$Em=e,a==null?this.removeAttribute(r):this.setAttribute(r,a),this._$Em=null}}_$AK(e,n){let i=this.constructor,r=i._$Eh.get(e);if(r!==void 0&&this._$Em!==r){let a=i.getPropertyOptions(r),s=typeof a.converter=="function"?{fromAttribute:a.converter}:a.converter?.fromAttribute!==void 0?a.converter:Bt;this._$Em=r;let d=s.fromAttribute(n,a.type);this[r]=d??this._$Ej?.get(r)??d,this._$Em=null}}requestUpdate(e,n,i,r=!1,a){if(e!==void 0){let s=this.constructor;if(r===!1&&(a=this[e]),i??=s.getPropertyOptions(e),!((i.hasChanged??jn)(a,n)||i.useDefault&&i.reflect&&a===this._$Ej?.get(e)&&!this.hasAttribute(s._$Eu(e,i))))return;this.C(e,n,i)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,n,{useDefault:i,reflect:r,wrapped:a},s){i&&!(this._$Ej??=new Map).has(e)&&(this._$Ej.set(e,s??n??this[e]),a!==!0||s!==void 0)||(this._$AL.has(e)||(this.hasUpdated||i||(n=void 0),this._$AL.set(e,n)),r===!0&&this._$Em!==e&&(this._$Eq??=new Set).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(n){Promise.reject(n)}let e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(let[r,a]of this._$Ep)this[r]=a;this._$Ep=void 0}let i=this.constructor.elementProperties;if(i.size>0)for(let[r,a]of i){let{wrapped:s}=a,d=this[r];s!==!0||this._$AL.has(r)||d===void 0||this.C(r,void 0,a,d)}}let e=!1,n=this._$AL;try{e=this.shouldUpdate(n),e?(this.willUpdate(n),this._$EO?.forEach(i=>i.hostUpdate?.()),this.update(n)):this._$EM()}catch(i){throw e=!1,this._$EM(),i}e&&this._$AE(n)}willUpdate(e){}_$AE(e){this._$EO?.forEach(n=>n.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&=this._$Eq.forEach(n=>this._$ET(n,this[n])),this._$EM()}updated(e){}firstUpdated(e){}};I.elementStyles=[],I.shadowRootOptions={mode:"open"},I[Ce("elementProperties")]=new Map,I[Ce("finalized")]=new Map,ma?.({ReactiveElement:I}),(Ie.reactiveElementVersions??=[]).push("2.1.2");var Ft=globalThis,Gn=t=>t,Ke=Ft.trustedTypes,Wn=Ke?Ke.createPolicy("lit-html",{createHTML:t=>t}):void 0,Vt="$lit$",K=`lit$${Math.random().toFixed(9).slice(2)}$`,It="?"+K,fa=`<${It}>`,ie=document,Te=()=>ie.createComment(""),Ae=t=>t===null||typeof t!="object"&&typeof t!="function",Kt=Array.isArray,Qn=t=>Kt(t)||typeof t?.[Symbol.iterator]=="function",Nt=`[ 	
\f\r]`,Se=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,Zn=/-->/g,qn=/>/g,te=RegExp(`>|${Nt}(?:([^\\s"'>=/]+)(${Nt}*=${Nt}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),Yn=/'/g,Xn=/"/g,ei=/^(?:script|style|textarea|title)$/i,Ut=t=>(e,...n)=>({_$litType$:t,strings:e,values:n}),c=Ut(1),jt=Ut(2),Ks=Ut(3),U=Symbol.for("lit-noChange"),p=Symbol.for("lit-nothing"),Jn=new WeakMap,ne=ie.createTreeWalker(ie,129);function ti(t,e){if(!Kt(t)||!t.hasOwnProperty("raw"))throw Error("invalid template strings array");return Wn!==void 0?Wn.createHTML(e):e}var ni=(t,e)=>{let n=t.length-1,i=[],r,a=e===2?"<svg>":e===3?"<math>":"",s=Se;for(let d=0;d<n;d++){let l=t[d],u,f,m=-1,g=0;for(;g<l.length&&(s.lastIndex=g,f=s.exec(l),f!==null);)g=s.lastIndex,s===Se?f[1]==="!--"?s=Zn:f[1]!==void 0?s=qn:f[2]!==void 0?(ei.test(f[2])&&(r=RegExp("</"+f[2],"g")),s=te):f[3]!==void 0&&(s=te):s===te?f[0]===">"?(s=r??Se,m=-1):f[1]===void 0?m=-2:(m=s.lastIndex-f[2].length,u=f[1],s=f[3]===void 0?te:f[3]==='"'?Xn:Yn):s===Xn||s===Yn?s=te:s===Zn||s===qn?s=Se:(s=te,r=void 0);let h=s===te&&t[d+1].startsWith("/>")?" ":"";a+=s===Se?l+fa:m>=0?(i.push(u),l.slice(0,m)+Vt+l.slice(m)+K+h):l+K+(m===-2?d:h)}return[ti(t,a+(t[n]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),i]},ze=class t{constructor({strings:e,_$litType$:n},i){let r;this.parts=[];let a=0,s=0,d=e.length-1,l=this.parts,[u,f]=ni(e,n);if(this.el=t.createElement(u,i),ne.currentNode=this.el.content,n===2||n===3){let m=this.el.content.firstChild;m.replaceWith(...m.childNodes)}for(;(r=ne.nextNode())!==null&&l.length<d;){if(r.nodeType===1){if(r.hasAttributes())for(let m of r.getAttributeNames())if(m.endsWith(Vt)){let g=f[s++],h=r.getAttribute(m).split(K),b=/([.?@])?(.*)/.exec(g);l.push({type:1,index:a,name:b[2],strings:h,ctor:b[1]==="."?je:b[1]==="?"?Ge:b[1]==="@"?We:ae}),r.removeAttribute(m)}else m.startsWith(K)&&(l.push({type:6,index:a}),r.removeAttribute(m));if(ei.test(r.tagName)){let m=r.textContent.split(K),g=m.length-1;if(g>0){r.textContent=Ke?Ke.emptyScript:"";for(let h=0;h<g;h++)r.append(m[h],Te()),ne.nextNode(),l.push({type:2,index:++a});r.append(m[g],Te())}}}else if(r.nodeType===8)if(r.data===It)l.push({type:2,index:a});else{let m=-1;for(;(m=r.data.indexOf(K,m+1))!==-1;)l.push({type:7,index:a}),m+=K.length-1}a++}}static createElement(e,n){let i=ie.createElement("template");return i.innerHTML=e,i}};function re(t,e,n=t,i){if(e===U)return e;let r=i!==void 0?n._$Co?.[i]:n._$Cl,a=Ae(e)?void 0:e._$litDirective$;return r?.constructor!==a&&(r?._$AO?.(!1),a===void 0?r=void 0:(r=new a(t),r._$AT(t,n,i)),i!==void 0?(n._$Co??=[])[i]=r:n._$Cl=r),r!==void 0&&(e=re(t,r._$AS(t,e.values),r,i)),e}var Ue=class{constructor(e,n){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=n}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){let{el:{content:n},parts:i}=this._$AD,r=(e?.creationScope??ie).importNode(n,!0);ne.currentNode=r;let a=ne.nextNode(),s=0,d=0,l=i[0];for(;l!==void 0;){if(s===l.index){let u;l.type===2?u=new pe(a,a.nextSibling,this,e):l.type===1?u=new l.ctor(a,l.name,l.strings,this,e):l.type===6&&(u=new Ze(a,this,e)),this._$AV.push(u),l=i[++d]}s!==l?.index&&(a=ne.nextNode(),s++)}return ne.currentNode=ie,r}p(e){let n=0;for(let i of this._$AV)i!==void 0&&(i.strings!==void 0?(i._$AI(e,i,n),n+=i.strings.length-2):i._$AI(e[n])),n++}},pe=class t{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(e,n,i,r){this.type=2,this._$AH=p,this._$AN=void 0,this._$AA=e,this._$AB=n,this._$AM=i,this.options=r,this._$Cv=r?.isConnected??!0}get parentNode(){let e=this._$AA.parentNode,n=this._$AM;return n!==void 0&&e?.nodeType===11&&(e=n.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,n=this){e=re(this,e,n),Ae(e)?e===p||e==null||e===""?(this._$AH!==p&&this._$AR(),this._$AH=p):e!==this._$AH&&e!==U&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):Qn(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==p&&Ae(this._$AH)?this._$AA.nextSibling.data=e:this.T(ie.createTextNode(e)),this._$AH=e}$(e){let{values:n,_$litType$:i}=e,r=typeof i=="number"?this._$AC(e):(i.el===void 0&&(i.el=ze.createElement(ti(i.h,i.h[0]),this.options)),i);if(this._$AH?._$AD===r)this._$AH.p(n);else{let a=new Ue(r,this),s=a.u(this.options);a.p(n),this.T(s),this._$AH=a}}_$AC(e){let n=Jn.get(e.strings);return n===void 0&&Jn.set(e.strings,n=new ze(e)),n}k(e){Kt(this._$AH)||(this._$AH=[],this._$AR());let n=this._$AH,i,r=0;for(let a of e)r===n.length?n.push(i=new t(this.O(Te()),this.O(Te()),this,this.options)):i=n[r],i._$AI(a),r++;r<n.length&&(this._$AR(i&&i._$AB.nextSibling,r),n.length=r)}_$AR(e=this._$AA.nextSibling,n){for(this._$AP?.(!1,!0,n);e!==this._$AB;){let i=Gn(e).nextSibling;Gn(e).remove(),e=i}}setConnected(e){this._$AM===void 0&&(this._$Cv=e,this._$AP?.(e))}},ae=class{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,n,i,r,a){this.type=1,this._$AH=p,this._$AN=void 0,this.element=e,this.name=n,this._$AM=r,this.options=a,i.length>2||i[0]!==""||i[1]!==""?(this._$AH=Array(i.length-1).fill(new String),this.strings=i):this._$AH=p}_$AI(e,n=this,i,r){let a=this.strings,s=!1;if(a===void 0)e=re(this,e,n,0),s=!Ae(e)||e!==this._$AH&&e!==U,s&&(this._$AH=e);else{let d=e,l,u;for(e=a[0],l=0;l<a.length-1;l++)u=re(this,d[i+l],n,l),u===U&&(u=this._$AH[l]),s||=!Ae(u)||u!==this._$AH[l],u===p?e=p:e!==p&&(e+=(u??"")+a[l+1]),this._$AH[l]=u}s&&!r&&this.j(e)}j(e){e===p?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}},je=class extends ae{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===p?void 0:e}},Ge=class extends ae{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==p)}},We=class extends ae{constructor(e,n,i,r,a){super(e,n,i,r,a),this.type=5}_$AI(e,n=this){if((e=re(this,e,n,0)??p)===U)return;let i=this._$AH,r=e===p&&i!==p||e.capture!==i.capture||e.once!==i.once||e.passive!==i.passive,a=e!==p&&(i===p||r);r&&this.element.removeEventListener(this.name,this,i),a&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,e):this._$AH.handleEvent(e)}},Ze=class{constructor(e,n,i){this.element=e,this.type=6,this._$AN=void 0,this._$AM=n,this.options=i}get _$AU(){return this._$AM._$AU}_$AI(e){re(this,e)}},ii={M:Vt,P:K,A:It,C:1,L:ni,R:Ue,D:Qn,V:re,I:pe,H:ae,N:Ge,U:We,B:je,F:Ze},ga=Ft.litHtmlPolyfillSupport;ga?.(ze,pe),(Ft.litHtmlVersions??=[]).push("3.3.3");var ri=(t,e,n)=>{let i=n?.renderBefore??e,r=i._$litPart$;if(r===void 0){let a=n?.renderBefore??null;i._$litPart$=r=new pe(e.insertBefore(Te(),a),a,void 0,n??{})}return r._$AI(t),r};var Gt=globalThis,V=class extends I{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){let e=super.createRenderRoot();return this.renderOptions.renderBefore??=e.firstChild,e}update(e){let n=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=ri(n,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return U}};V._$litElement$=!0,V.finalized=!0,Gt.litElementHydrateSupport?.({LitElement:V});var _a=Gt.litElementPolyfillSupport;_a?.({LitElement:V});(Gt.litElementVersions??=[]).push("4.2.2");var ai={picker_name:"BamBuddy-Drucker",picker_description:"Zeigt und steuert einen Drucker aus BamBuddy: Fortschritt, Kamera, Temperaturen, Filament und Achsen bewegen.",no_printer:"W\xE4hle in den Einstellungen der Karte einen Drucker.",not_found:"Dieser Drucker ist nicht mehr verf\xFCgbar. W\xE4hle ihn in den Einstellungen der Karte neu aus \u2013 oder einen anderen.",not_a_printer:"Dieses Ger\xE4t ist kein BamBuddy-Drucker. W\xE4hle einen Drucker, keine AMS-Einheit, keine Steckdose und nicht den BamBuddy-Server.",invalid_option:"Ung\xFCltiger Wert f\xFCr \u201E{option}\u201C: {value}. Erlaubt: {allowed}.",allowed_device:"die ID eines Drucker-Ger\xE4ts",editor_unavailable:"Der visuelle Editor wurde nicht geladen. Bearbeite die Karte im Code-Editor (\u201ECode-Editor anzeigen\u201C).",editor_printer:"Drucker",editor_printer_help:"Ein Drucker der BamBuddy-Integration, keine AMS-Einheit.",editor_camera:"Livebild",editor_camera_help:"Nach Antippen: Ein Tipp aufs Bild startet es. Automatisch: Es l\xE4uft, solange das Dashboard offen ist, und braucht dauernd Bandbreite. Nie: nur das Bild des Druckauftrags.",camera_tap:"Nach Antippen",camera_always:"Automatisch",camera_off:"Nie",allowed_list:"eine Liste aus {values}",editor_group_general:"Allgemein",editor_start_hidden:"Achtung: Der Tab \u201E{tab}\u201C ist ausgeblendet. Die Karte \xF6ffnet mit \u201EStatus\u201C.",editor_group_status:"Status",editor_group_control:"Steuerung",editor_group_filament:"Filament",editor_blocks:"Bereich hinzuf\xFCgen",editor_blocks_help:"Die Bereiche im Tab \u201EStatus\u201C unter dem Druckauftrag. Ziehe einen Bereich an die gew\xFCnschte Stelle; \xD7 blendet ihn aus. Drucksteuerung und Druckgeschwindigkeit erscheinen nur w\xE4hrend eines Drucks, Strom nur, wenn BamBuddy dem Drucker eine Steckdose zuordnet.",sample_job:"Beispiel \u2013 erscheint w\xE4hrend eines Drucks",sample_offline:"Beispiel \u2013 erscheint, sobald der Drucker online ist",sample_unreachable:"Beispiel \u2013 erscheint, sobald BamBuddy antwortet",block_controls:"Drucksteuerung",block_temperatures:"Temperaturen",block_ams:"AMS und Filament",block_fans:"L\xFCfter",block_speed:"Druckgeschwindigkeit",editor_chips:"Chip hinzuf\xFCgen",editor_chips_help:"Die Chips unter dem Namen. Ziehe einen Chip an die gew\xFCnschte Stelle; \xD7 blendet ihn aus. T\xFCr, SD-Karte / USB-Stick und Trocknen erscheinen nur, wenn die T\xFCr offen ist, der Speicher fehlt oder ein AMS trocknet; Strom nur mit einer Steckdose. Eine HMS-Fehlermeldung zeigt die Karte immer.",chip_network:"Netzwerk",chip_hms:"HMS",chip_firmware:"Firmware",chip_maintenance:"Wartung",chip_door:"T\xFCr",chip_storage:"SD-Karte / USB-Stick",chip_drying:"Trocknen",editor_start_view:"Tab beim \xD6ffnen",editor_control_tab:"Tab \u201ESteuerung\u201C",editor_control_tab_help:"Blendet den Tab mit Heizen, Druckoptionen, Achsen und Extruder ein oder aus.",editor_sections:"Bereich hinzuf\xFCgen",editor_sections_help:"Die Bereiche im Tab \u201ESteuerung\u201C. Ziehe einen Bereich an die gew\xFCnschte Stelle; \xD7 blendet ihn aus.",section_heating:"Heizen",section_options:"Druckoptionen",section_motion:"Achsen und Extruder",editor_read_only:"Steuerelemente ausblenden",editor_read_only_help:"Zeigt den Drucker nur an: Licht, Heizen, Luftf\xFChrung und Druckoptionen als Zustand, ohne Kn\xF6pfe; Druck- und Filamentkn\xF6pfe, Trocknen, die Schalter der Steckdosen sowie Achsen und Extruder fallen weg. Keine Sperre: Aktionen, Automationen und die Ger\xE4teseite steuern ihn weiter.",editor_filament_tab:"Tab \u201EFilament\u201C",editor_filament_tab_help:"Blendet den Tab mit den AMS-Einheiten und der externen Spule ein oder aus \u2013 zum Laden, Entladen, Festlegen und Trocknen des Filaments.",editor_ams_folding:"AMS-Einheiten",editor_ams_folding_help:"Eingeklappt zeigt jede Einheit ohne ihre F\xE4cher; ein Tipp klappt sie auf.",folding_auto:"Automatisch (ab 3 eingeklappt)",folding_folded:"Eingeklappt",folding_open:"Ausgeklappt",tab_status:"Status",tab_control:"Steuerung",tab_filament:"Filament",aria_views:"Ansichten",online:"Online",offline:"Offline",light:"Kammerbeleuchtung",light_plain:"Licht",dismiss:"Schlie\xDFen",error_dismiss:"Fehlermeldung schlie\xDFen",cancel:"Abbrechen",error_generic:"Das hat nicht geklappt. Versuche es gleich noch einmal.",sent:"Gesendet",ams_activity:"AMS: {state}",more:"Weitere Optionen",menu_device_page:"Ger\xE4teseite \xF6ffnen",menu_info:"Druckerinformationen",menu_refresh:"Status aktualisieren",menu_maintenance:"Wartung",check_connection:"Verbindung pr\xFCfen",wifi:"WLAN",wifi_signal:"Netzwerk: WLAN, {value}, {quality}",wifi_good:"gut",wifi_fair:"mittel",wifi_weak:"schwach",lan:"LAN",lan_aria:"Netzwerk: LAN (Kabel)",lan_wired:"LAN (Kabel)",hms_ok:"HMS OK",hms_pill:"{count} HMS",hms_pill_aria:"{count} HMS-Meldungen",hms_pill_aria_one:"1 HMS-Meldung",hms_pill_none:"HMS OK \u2013 keine Meldungen",hms_title:"Meldungen des Druckers (HMS)",hms_none_dialog:"Keine Meldungen. HMS ist das Warnsystem des Druckers.",hms_next:"Pr\xFCfe den Druck. Setze ihn danach fort oder stoppe ihn.",hms_next_elsewhere:"Pr\xFCfe den Druck. Setze ihn danach am Drucker oder in BamBuddy fort oder stoppe ihn dort.",hms_next_read:"Pr\xFCfe den Druck. Setze ihn danach am Drucker, in BamBuddy oder in Home Assistant fort oder stoppe ihn dort.",hms_more:"+{n} weitere",hms_clear_note:"L\xF6schen entfernt nur die Meldung: Fehler, die der Drucker weiter sieht, meldet er erneut.",firmware:"Firmware",firmware_update:"Firmware {version}: Update verf\xFCgbar",firmware_update_label:"Update {latest} verf\xFCgbar, installiert ist Firmware {version}",firmware_update_chip:"Update {version}",firmware_offline:"Firmware {version} (Drucker offline)",firmware_unreachable:"Firmware {version} (keine Daten von BamBuddy)",firmware_current:"Firmware {version}: aktuell",firmware_version:"Firmware {version}",firmware_installed:"Installiert",firmware_latest:"Neueste",firmware_available:"Verf\xFCgbar",firmware_notes:"Versionshinweise",firmware_note:"Installiere Updates am Drucker, in Bambu Handy oder in BamBuddy.",info_model:"Modell",info_name:"Name in BamBuddy",info_server:"BamBuddy-Server",info_status:"Status",info_print_status:"Druckstatus",info_ip:"IP-Adresse",info_serial:"Seriennummer",info_network:"Netzwerk",info_developer:"Entwicklermodus",info_nozzles:"D\xFCsen",info_hours:"Druckstunden",info_on:"An",info_off:"Aus",info_developer_note:"Der Drucker nimmt keine Befehle an.",nozzle_count_one:"1 D\xFCse",nozzle_count:"{count} D\xFCsen",nozzle_side:"{side}: {nozzle}",copy_ip:"IP-Adresse kopieren",copy_serial:"Seriennummer kopieren",copied:"Kopiert",no_job:"Kein Druck aktiv",offline_text:"Der Drucker ist offline. Pr\xFCfe, ob er eingeschaltet und mit BamBuddy verbunden ist.",unreachable_text:"Keine Daten von BamBuddy. Pr\xFCfe, ob BamBuddy l\xE4uft, und unter Einstellungen \u2192 Ger\xE4te & Dienste, ob BamBuddy einen neuen API-Schl\xFCssel braucht.",unreachable_text_user:"Keine Daten von BamBuddy. Pr\xFCfe, ob BamBuddy l\xE4uft; vielleicht muss eine Administratorin oder ein Administrator einen neuen API-Schl\xFCssel eingeben.",unreachable_short:"Keine Daten von BamBuddy",layer:"Schicht {current} / {total}",remaining:"noch {time}",ends:"Ende {time}",progress:"Fortschritt",live:"Livebild",live_badge:"Live",live_stop:"Livebild schlie\xDFen",camera_failed:"Die Kamera ist nicht verf\xFCgbar.",fps_value:"{fps} fps",fps_aria:"{fps} Bilder pro Sekunde",fps_open:"Bildrate einstellen",fps_title:"Bildrate der Kamera",fps_lower:"{step} Bilder pro Sekunde weniger",fps_raise:"{step} Bilder pro Sekunde mehr",fps_note:"Diese Kamera schafft bis zu {max} Bilder pro Sekunde. Die Bildrate gilt f\xFCr jedes Dashboard und Ger\xE4t; eingestellt ist zun\xE4chst die h\xF6chste. Schaut gerade jemand anderes zu, etwa in BamBuddy selbst, kann BamBuddy bei dessen Bildrate bleiben \u2013 der Chip im Livebild zeigt, was ankommt.",fps_arriving:"Gerade kommen {now} Bilder pro Sekunde an. Die eingestellte Bildrate gilt, sobald das Livebild neu startet, w\xE4hrend sonst niemand zuschaut.",fps_restart:"Livebild neu starten",retry:"Erneut versuchen",nozzle:"D\xFCse",nozzle_left:"Linke D\xFCse",nozzle_right:"Rechte D\xFCse",bed:"Bett",chamber:"Kammer",heater_off:"Aus",target:"Ziel {value}",fan_part:"Teilek\xFChlung",fan_aux:"Zusatz",fan_chamber:"Kammer",fan_exhaust:"Abluft",fan_left_aux:"Linker Zusatz",fan_hotend:"Hotend",fan_part_name:"Teilek\xFChlungsl\xFCfter",fan_aux_name:"Zusatzl\xFCfter",fan_chamber_name:"Kammerl\xFCfter",fan_exhaust_name:"Abluftl\xFCfter",fan_left_aux_name:"Linker Zusatzl\xFCfter",fan_hotend_name:"Hotend-L\xFCfter",fan_off:"Aus",fans:"L\xFCfter",open_filament:"Filament-Ansicht \xF6ffnen",strip_unit:"{name}: {slots}",strip_humidity:"Feuchte {humidity}",strip_temperature:"Temperatur {temperature}",side_left_short:"L",side_right_short:"R",external_short:"Ext",hms_error:"Fehler",hms_warning:"Warnung",hms_notice:"Hinweis",hms_no_text:"{severity}: BamBuddy hat keinen Text zu diesem Code.",hms_answer_resume_printing:"Druck fortsetzen",hms_answer_resume_printing_defects:"Fortsetzen (M\xE4ngel akzeptabel)",hms_answer_resume_printing_probelm_solved:"Fortsetzen (Problem gel\xF6st)",hms_answer_problem_solved_resume:"Problem gel\xF6st, fortsetzen",hms_answer_filament_load_resume:"Filament geladen, fortsetzen",hms_answer_proceed:"Fortfahren",hms_answer_dbl_check_resume:"Fortsetzen",hms_answer_stop_printing:"Druck stoppen",hms_answer_ignore_resume:"Ignorieren und fortsetzen",hms_answer_ignore_no_reminder_next_time:"Ignorieren, nicht mehr erinnern",hms_answer_dont_remind_next_time:"Nicht mehr erinnern",hms_answer_no_reminder_next_time:"Nicht mehr erinnern",hms_answer_filament_extruded:"Filament extrudiert, weiter",hms_answer_dbl_check_done:"Fertig",hms_answer_retry_filament_extruded:"Noch nicht extrudiert, erneut versuchen",hms_answer_continue:"Fertig, weiter",hms_answer_retry_problem_solved:"Erneut versuchen (Problem gel\xF6st)",hms_answer_dbl_check_retry:"Erneut versuchen",hms_answer_abort:"Abbrechen",hms_answer_ok_button:"OK",hms_answer_dbl_check_ok:"Best\xE4tigen",hms_answer_refresh_nozzle:"Erneut pr\xFCfen",hms_answer_turn_off_fire_alarm:"Brandalarm ausschalten",hms_answer_stop_drying:"Trocknen stoppen",hms_answer_disable_purification:"Keine Luftreinigung bei diesem Druck",hms_wiki:"HMS-Codes im Bambu-Lab-Wiki",hms_unknown:"HMS-Meldung",hms_count:"HMS-Fehler: {count}",hms_clear:"HMS-Fehler l\xF6schen",plate_text:"Nimm den Druck von der Platte und tippe dann auf \u201EDruckplatte ger\xE4umt\u201C. BamBuddy startet den n\xE4chsten Druck aus der Warteschlange erst danach.",plate_text_read:"Nimm den Druck von der Platte. BamBuddy startet den n\xE4chsten Druck aus der Warteschlange erst, wenn das best\xE4tigt ist: in BamBuddy oder mit \u201EDruckplatte ger\xE4umt\u201C in Home Assistant.",plate_text_bambuddy:"Nimm den Druck von der Platte. BamBuddy startet den n\xE4chsten Druck aus der Warteschlange erst, wenn das in BamBuddy best\xE4tigt ist.",plate_cleared:"Druckplatte ger\xE4umt",pause:"Druck pausieren",resume:"Druck fortsetzen",paused_empty:"Kein Filament geladen. Lade eines im Tab \u201EFilament\u201C, bevor du fortsetzt.",paused_empty_no_tab:"Kein Filament geladen. Lade eines, bevor du fortsetzt.",stop:"Druck stoppen",speed:"Druckgeschwindigkeit",developer_off:"Der Drucker nimmt keine Befehle an: Sein Entwicklermodus (LAN) ist aus. Schalte ihn am Display des Druckers unter Einstellungen \u2192 Netzwerk (oder WLAN) ein: erst \u201ELAN Only Mode\u201C, dann \u201EDeveloper Mode\u201C. Trage danach den neuen Zugangscode in BamBuddy ein.",stop_title:"Druck stoppen?",stop_text:"Der Druck l\xE4sst sich danach nicht fortsetzen.",stop_keep:"Weiterdrucken",stop_confirm:"Druck stoppen",skip:"Objekte \xFCberspringen",skip_one:"1 Objekt \xFCberspringen",skip_many:"{count} Objekte \xFCberspringen",skip_text:"\xDCbersprungene Objekte werden in diesem Druck nicht mehr gedruckt. Das l\xE4sst sich nicht r\xFCckg\xE4ngig machen.",skip_loading:"Objekte werden geladen \u2026",skip_none_listed:"BamBuddy kennt keine Objekte dieses Drucks.",skip_object:"Objekt {id}",skip_skipped:"\xDCbersprungen",skip_all:"Um alle Objekte zu \xFCberspringen, stoppe stattdessen den Druck.",skip_single:"Dieser Druck hat nur ein Objekt. Um es nicht zu drucken, stoppe den Druck.",heating:"Heizen",heat_now:"Jetzt {value}",heat_lower:"{what} {step}\xA0{unit} k\xFChler",heat_raise:"{what} {step}\xA0{unit} w\xE4rmer",heat_start:"{what} auf {value} heizen",heat_off:"{what} ausschalten",cool_down:"Abk\xFChlen",active_nozzle:"Aktive D\xFCse",nozzle_active:"aktiv",step:"Schritt",move:"{axis} um {distance} mm bewegen",home:"Referenzfahrt",slot_named:"{shown} \u2013 {place}",external_left_place:"Linke externe Spule",external_right_place:"Rechte externe Spule",heat_target_said:"{what}, Ziel:",hours_long:"Stunden",home_aria:"Alle Achsen referenzieren",maint_marked:"\u201E{task}\u201C als erledigt markiert.",home_title:"Alle Achsen referenzieren?",home_text:"Der Druckkopf f\xE4hrt in seine Ausgangsposition; nimm vorher alles von der Druckplatte.",bed_axis:"Bett",bed_closer:"N\xE4her",bed_away:"Weiter weg",bed_closer_aria:"Bett {step} mm n\xE4her an die D\xFCse",bed_away_aria:"Bett {step} mm weiter weg von der D\xFCse",nozzle_height:"D\xFCsenh\xF6he",nozzle_closer_aria:"D\xFCse {step} mm n\xE4her ans Bett",nozzle_away_aria:"D\xFCse {step} mm weiter weg vom Bett",extruder:"Extruder",extrude:"Extrudieren",retract:"Zur\xFCckziehen",extrude_aria:"{length} mm Filament extrudieren",retract_aria:"{length} mm Filament zur\xFCckziehen",cold_nozzle:"Zum Extrudieren heize die D\xFCse unter \u201EHeizen\u201C auf mindestens {temperature}.",cold_nozzle_left:"Zum Extrudieren heize die linke D\xFCse (aktiv) unter \u201EHeizen\u201C auf mindestens {temperature}.",cold_nozzle_right:"Zum Extrudieren heize die rechte D\xFCse (aktiv) unter \u201EHeizen\u201C auf mindestens {temperature}.",cold_nozzle_plain:"Zum Extrudieren muss die D\xFCse mindestens {temperature} hei\xDF sein.",cold_nozzle_left_plain:"Zum Extrudieren muss die linke D\xFCse (aktiv) mindestens {temperature} hei\xDF sein.",cold_nozzle_right_plain:"Zum Extrudieren muss die rechte D\xFCse (aktiv) mindestens {temperature} hei\xDF sein.",jog_note:"Tippe zuerst auf das Haus, damit der Drucker seine Position kennt. Er stoppt nicht am Rand \u2013 fahre in kleinen Schritten.",busy_reason:"Bewegen und Extrudieren sind m\xF6glich, sobald der Druck fertig ist.",changing_reason:"Warte, bis der Filamentwechsel fertig ist.",changing_paused:"Warte, bis der Filamentwechsel fertig ist, dann setze den Druck fort.",detection:"Druckoptionen",detection_all_on:"Alle an",detection_off:"{off} aus",detection_all_off:"Alle aus",detection_hint:"An: Der Drucker pausiert den Druck, wenn die Erkennung anschl\xE4gt. Empfindlichkeit wie am Drucker eingestellt. Eine ausgeschaltete Erkennung bleibt aus, auch bei den n\xE4chsten Drucken.",detection_ai_monitoring:"KI-Druck\xFCberwachung",detection_ai_monitoring_x1:"Spaghetti und Stau im Auswurfschacht",detection_first_layer_inspection:"Inspektion der ersten Schicht",detection_build_plate_detection:"Druckplattenerkennung",detection_build_plate_position_detection:"Positionserkennung der Druckplatte",detection_spaghetti_detection:"Spaghetti-Erkennung",detection_pileup_detection:"Auswurfschacht-\xDCberwachung",detection_clumping_detection:"Erkennung von D\xFCsenklumpen",detection_air_printing_detection:"Druck-ins-Leere-Erkennung",external:"Externe Spule",externals:"Externe Spulen",left:"Links",right:"Rechts",humidity:"Feuchte",temperature:"Temperatur",empty:"Leer",not_set:"Nicht festgelegt",unknown:"Unbekannt",in_use:"In Gebrauch",load:"Laden",unload:"Entladen",load_title_from:"{filament} aus {place} laden?",load_title_external:"{filament} von der externen Spule laden?",load_title_left:"{filament} von der linken externen Spule laden?",load_title_right:"{filament} von der rechten externen Spule laden?",load_text:"Der Drucker heizt die D\xFCse, entl\xE4dt das aktuelle Filament und l\xE4dt dieses. Das dauert einige Minuten.",load_text_left:"Der Drucker heizt die linke D\xFCse, entl\xE4dt ihr Filament und l\xE4dt dieses. Das dauert einige Minuten.",load_text_right:"Der Drucker heizt die rechte D\xFCse, entl\xE4dt ihr Filament und l\xE4dt dieses. Das dauert einige Minuten.",unload_text_left:"Der Drucker heizt die linke D\xFCse und zieht ihr Filament zur\xFCck.",unload_text_right:"Der Drucker heizt die rechte D\xFCse und zieht ihr Filament zur\xFCck.",strip_nozzle_left:"linke D\xFCse",strip_nozzle_right:"rechte D\xFCse",unload_title:"Filament entladen?",unload_text:"Der Drucker heizt die D\xFCse und zieht das Filament zur\xFCck.",ht_load:"Lade Filament aus dem AMS HT am Display des Druckers.",filament_pause:"Pausiere den Druck, um das Filament zu wechseln.",filament_paused:"Druck pausiert: Du kannst das Filament jetzt wechseln.",filament_paused_fault:"Der Drucker hat den Druck angehalten: K\xFCmmere dich zuerst um seine Meldung. Du kannst hier das Filament wechseln und dann fortsetzen.",paused_change:"Der Druck bleibt pausiert. Setze ihn fort, wenn das neue Filament drin ist.",drying:"Trocknet \xB7 noch\xA0{time}",dry_at_printer:"Starte und stoppe das Trocknen am Display des Druckers.",drying_now:"Trocknet",drying_at:"Trocknet bei {temperature} \xB7 noch\xA0{time}",drying_now_at:"Trocknet bei {temperature}",not_drying:"Trocknet nicht",dry:"Trocknen",dry_stop:"Trocknen stoppen",dry_stop_title:"Trocknen stoppen?",dry_stop_text:"{unit} trocknet noch {time} lang.",dry_stop_now:"{unit} h\xF6rt dann auf zu trocknen.",dry_keep:"Weiter trocknen",dry_title:"Filament in {unit} trocknen",dry_temperature:"Temperatur",dry_duration:"Dauer",dry_start:"Trocknen starten",dry_suggested:"Empfehlung f\xFCr das geladene Filament.",dry_suggested_for:"Empfehlung f\xFCr das geladene Filament: {filaments}.",dry_mixed:"F\xFCr die empfindlichste Spule eingestellt: {spools}",dry_temperature_lower:"Temperatur senken",dry_temperature_raise:"Temperatur erh\xF6hen",dry_duration_lower:"Trocknen verk\xFCrzen",dry_duration_raise:"Trocknen verl\xE4ngern",set_filament:"Filament festlegen",edit_slot:"{slot} bearbeiten",edit_external:"Externe Spule bearbeiten",edit_external_left:"Linke externe Spule bearbeiten",edit_external_right:"Rechte externe Spule bearbeiten",slot_label:"Fach {slot} \xB7 {unit}",filament_title:"Filament von {slot}",filament_title_external:"Filament der externen Spule",filament_title_left:"Filament der linken externen Spule",filament_title_right:"Filament der rechten externen Spule",material:"Material",material_keep:"{name} behalten",material_choose:"W\xE4hlen \u2026",color:"Farbe",color_other:"Andere Farbe \u2026",color_current:"Aktuelle Farbe",color_chosen:"Gew\xE4hlte Farbe",color_white:"Wei\xDF",color_black:"Schwarz",color_gray:"Grau",color_silver:"Silber",color_red:"Rot",color_orange:"Orange",color_yellow:"Gelb",color_green:"Gr\xFCn",color_turquoise:"T\xFCrkis",color_cyan:"Cyan",color_blue:"Blau",color_purple:"Lila",color_pink:"Pink",color_brown:"Braun",color_beige:"Beige",color_gold:"Gold",filament_note:"F\xFCr Spulen ohne Chip. Bei einem neuen Material nimmt der Drucker daf\xFCr die Standardeinstellungen von Bambu Lab.",filament_set:"\xDCbernehmen",filament_rfid:"Eine Bambu-Lab-Spule mit Chip: Material und Farbe liest das AMS vom Chip.",k_profile:"K-Profil (Flussdynamik)",k_keep:"{profile} behalten",k_default:"Standard des Druckers (K {k})",k_matching:"Passend zu {material}",k_others:"Weitere K-Profile auf diesem Drucker",k_loading:"Der Drucker wird nach seinen K-Profilen gefragt \u2026",k_none:"Der Drucker nennt f\xFCr diese D\xFCse kein K-Profil oder hat nicht rechtzeitig geantwortet. Um neu zu fragen, schlie\xDFe den Dialog und \xF6ffne ihn noch einmal.",reset_in_use:"Der pausierte Druck nimmt sein Filament aus diesem Fach.",reset_in_use_spool:"Der pausierte Druck nimmt sein Filament von dieser Spule.",hms_next_answers:"Pr\xFCfe den Druck und antworte dann hier \u2013 wie am Display des Druckers.",k_keep_number:"K-Profil Nr. {index} behalten",k_keep_plain:"Das bisherige behalten",k_failed:"Der Drucker hat seine K-Profile nicht genannt: Das Fach beh\xE4lt sein eigenes.",k_other_note:"Ein K-Profil eines anderen Materials: BamBuddy tr\xE4gt das Fach dann unter diesem Material ein.",k_unsure:"Im Zweifel so lassen, wie es ist.",rfid_read:"Chip neu lesen",rfid_unload_hint:"Entlade erst das Filament aus {slots}: Das AMS liest einen Chip nur, solange kein Filament geladen ist.",plug_turn_off:"Ausschalten",plug_turn_on:"Einschalten",plug_turn_off_named:"Ausschalten: \u201E{plug}\u201C",plug_turn_on_named:"Einschalten: \u201E{plug}\u201C",load_from:"Laden aus {place}",load_from_external:"Laden von der externen Spule",load_from_left:"Laden von der linken externen Spule",load_from_right:"Laden von der rechten externen Spule",dry_named:"Trocknen: {unit}",dry_stop_named:"Trocknen stoppen: {unit}",rfid_unload_hint_external:"Entlade erst das Filament von der externen Spule: Das AMS liest einen Chip nur, solange kein Filament geladen ist.",rfid_unload_hint_left:"Entlade erst das Filament von der linken externen Spule: Das AMS liest einen Chip nur, solange kein Filament geladen ist.",rfid_unload_hint_right:"Entlade erst das Filament von der rechten externen Spule: Das AMS liest einen Chip nur, solange kein Filament geladen ist.",k_keep_plain_spool:"Das bisherige behalten",k_failed_spool:"Der Drucker hat seine K-Profile nicht genannt: Die Spule beh\xE4lt ihr eigenes.",k_other_note_spool:"Ein K-Profil eines anderen Materials: BamBuddy tr\xE4gt die Spule dann unter diesem Material ein.",slot_reset:"Fach zur\xFCcksetzen",spool_reset:"Spule zur\xFCcksetzen",slot_tools_running:"Pausiere erst den Druck: Dann l\xE4sst sich das Fach zur\xFCcksetzen oder der Chip neu lesen.",spool_tools_running:"Pausiere erst den Druck: Dann l\xE4sst sich die Spule zur\xFCcksetzen.",reset_title:"Fach zur\xFCcksetzen?",reset_text:"Material und Farbe des Fachs werden gel\xF6scht. Eine Spule mit Chip erscheint wieder, sobald das AMS den Chip liest.",reset_title_spool:"Spule zur\xFCcksetzen?",reset_text_spool:"Material und Farbe der Spule werden gel\xF6scht.",reset_confirm:"Zur\xFCcksetzen",filament_need_material:"W\xE4hle noch ein Material.",dur_min:"{m} Min.",dur_h:"{h} Std.",dur_hm:"{h} Std. {m} Min.",dur_dh:"{d} T. {h} Std.",dur_d:"{d} T.",hours:"Std.",maint_ok:"Wartung OK",maint_due:"{n} f\xE4llig",maint_ok_aria:"Wartung OK \u2013 nichts f\xE4llig",maint_due_aria:"{n} f\xE4llig \u2013 Wartung: {overdue} \xFCberf\xE4llig, {soon} bald f\xE4llig",door_open:"T\xFCr offen",storage_sd:"Keine SD-Karte",storage_usb:"Kein USB-Stick",storage_sd_title_in:"SD-Karte",storage_usb_title_in:"USB-Stick",storage_sd_text:"Ohne SD-Karte kann BamBuddy keine Drucke an den Drucker senden, und Drucke kommen ohne Vorschaubild ins Archiv. Stecke eine microSD-Karte ein.",storage_usb_text:"Ohne USB-Stick kann BamBuddy keine Drucke an den Drucker senden, und Drucke kommen ohne Vorschaubild ins Archiv. Stecke einen USB-Stick ein.",storage_sd_in:"Die SD-Karte steckt: BamBuddy kann wieder Drucke senden.",storage_usb_in:"Der USB-Stick steckt: BamBuddy kann wieder Drucke senden.",dry_chip_one_bare:"Trocknet",dry_chip_many_bare:"{n} AMS trocknen",dry_chip_aria:"{n} AMS-Einheiten trocknen, alle fertig in {time}",maint_title:"Wartung",maint_never:"Noch nie als erledigt markiert",maint_overdue:"{time} \xFCberf\xE4llig",maint_soon:"Bald f\xE4llig: in {time}",maint_in:"F\xE4llig in {time}",maint_done:"Erledigt",maint_done_aria:"\u201E{task}\u201C als erledigt markieren",maint_confirm:"Als erledigt markieren? Die Z\xE4hlung beginnt neu.",maint_hours:"Druckstunden: {hours}",maint_note:"Aufgaben und Intervalle stellst du in BamBuddy ein.",maint_all_never:"BamBuddy z\xE4hlt ab 0 Std., bis eine Aufgabe einmal als erledigt markiert ist. Markiere, was du schon gemacht hast.",maint_all_never_hidden:"BamBuddy z\xE4hlt ab 0 Std., bis eine Aufgabe einmal als erledigt markiert ist. Als erledigt markieren kannst du sie in BamBuddy \u2013 diese Karte blendet ihre Steuerelemente aus.",maint_none:"Keine Wartungsaufgaben.",maint_task_clean_build_plate:"Druckplatte reinigen",maint_task_clean_nozzle:"D\xFCse und Hotend reinigen",maint_task_belt_tension:"Riemenspannung pr\xFCfen",maint_task_ptfe_tube:"PTFE-Schlauch pr\xFCfen",maint_task_clean_carbon_rods:"Carbonstangen reinigen",maint_task_lubricate_steel_rods:"Stahlstangen schmieren",maint_task_clean_steel_rods:"Stahlstangen reinigen",maint_task_lubricate_rails:"Linearschienen schmieren",maint_task_clean_rails:"Linearschienen reinigen",check_again:"Erneut pr\xFCfen",check_running:"Die Verbindung wird gepr\xFCft \u2026 {s} s",check_running_sr:"Die Verbindung wird gepr\xFCft \u2026",check_running_hint:"Das dauert meist ein paar Sekunden, h\xF6chstens eine halbe Minute.",check_error:"Die Pr\xFCfung konnte nicht laufen: {error}",check_ok:"Keine Probleme gefunden.",check_warnings_one:"Der Drucker sollte funktionieren, aber 1 Punkt braucht Aufmerksamkeit.",check_warnings:"Der Drucker sollte funktionieren, aber {n} Punkte brauchen Aufmerksamkeit.",check_problems_one:"1 Problem gefunden.",check_problems:"{n} Probleme gefunden.",check_passed_one:"1 Pr\xFCfung bestanden",check_passed:"{n} Pr\xFCfungen bestanden",check_skipped:"{n} nicht gepr\xFCft",check_follows:"Folgt meist aus dem Problem oben.",check_skip:"Nicht gepr\xFCft.",check_port_mqtt:"Steuerung (Port 8883)",check_port_mqtt_fail:"Nicht erreichbar. Ist der Drucker an und hat er noch dieselbe IP-Adresse? Blockiert eine Firewall den Port?",check_port_ftps:"Datei\xFCbertragung (Port 990)",check_port_ftps_warn:"Nicht erreichbar: BamBuddy kann keine Drucke senden.",check_port_ftps_warn_fix:"Gib Port 990 frei.",check_port_ftps_warn_no_tls:"Port offen, aber der Dateidienst des Druckers h\xE4ngt. Starte den Drucker neu.",check_port_rtsps:"Kamera (Port {port})",check_port_rtsps_warn:"Nicht erreichbar: kein Livebild. Drucken geht trotzdem.",check_macos_local_network:"macOS: lokales Netzwerk",check_macos_local_network_warn_unsigned:"macOS blockiert die Verbindung ohne Meldung. F\xFChre das Update-Skript von BamBuddy aus (install/update_macos.sh) und starte BamBuddy neu.",check_macos_local_network_warn_permission:"Erlaube das Python von BamBuddy unter Systemeinstellungen \u2192 Datenschutz & Sicherheit \u2192 Lokales Netzwerk.",check_network_mode:"Netzwerk des Containers",check_network_mode_warn:"BamBuddy l\xE4uft im Bridge-Netz. F\xFCr die Druckersuche braucht es das Host-Netz (\u201Enetwork_mode: host\u201C).",check_network_mode_skip:"L\xE4uft nicht in einem Container.",check_network_mode_skip_unknown:"In einem Container ({runtime}); sein Netzwerkmodus ist nicht ermittelbar.",check_network_mode_skip_system_container:"In einem Systemcontainer ({runtime}): nicht anwendbar.",check_subnet:"Subnetz",check_subnet_warn:"Drucker ({printer_ip}) und BamBuddy ({host_ip}) sind in verschiedenen Netzen. Das geht nur mit Routing dazwischen.",check_subnet_skip:"Nicht ermittelbar.",check_external_storage:"Dateien auf externem Speicher",check_external_storage_fail:"Am Drucker aus: Archive bekommen kein Vorschaubild. Schalte \u201EGesendete Dateien auf externem Speicher speichern\u201C ein \u2013 am Drucker unter Druckeinstellungen oder im Slicer im Ger\xE4te-Tab.",check_external_storage_fail_no_media:"Keine SD-Karte und kein USB-Stick im Drucker: Drucke lassen sich nicht senden. Stecke eine SD-Karte oder einen USB-Stick ein.",check_external_storage_warn_internal_storage:"Der letzte Druck lag im internen Speicher, den BamBuddy nicht lesen kann: Er ist ohne Vorschaubild archiviert. Starte Drucke aus BamBuddy, oder sende sie im Slicer mit \u201ESenden\u201C und \u201EExtern\u201C.",check_external_storage_warn_internal_history:"Der letzte Druck kam aus dem Speicher des Druckers: ohne Vorschaubild archiviert. Starte Drucke aus BamBuddy oder dem Slicer.",check_external_storage_skip_unsupported_model:"Beim P1 nicht einstellbar. Nichts zu tun.",check_mqtt_auth:"Zugangsdaten",check_mqtt_auth_fail:"Erreichbar, aber nicht verbunden. Meist stimmt der Zugangscode nicht mehr: Er \xE4ndert sich, wenn du \u201ELAN Only\u201C oder den Entwicklermodus umschaltest. Trage ihn in BamBuddy neu ein.",check_mqtt_auth_fail_auth_rejected:"Der Drucker lehnt Zugangscode oder Seriennummer ab. Lies den Zugangscode am Display ab und trage ihn in BamBuddy neu ein.",check_mqtt_auth_skip:"Nicht gepr\xFCft: Port 8883 ist nicht erreichbar.",check_developer_mode:"Entwicklermodus (LAN)",check_developer_mode_skip:"Nicht gepr\xFCft: Daf\xFCr braucht es eine Verbindung zum Drucker.",check_printer_publishing:"Statusmeldungen",check_printer_publishing_fail:"Verbunden, aber der Drucker meldet nichts. Meist ist die Seriennummer in BamBuddy falsch geschrieben (Gro\xDF- und Kleinschreibung z\xE4hlt).",check_printer_publishing_skip:"Nicht gepr\xFCft: Daf\xFCr braucht es eine Verbindung zum Drucker.",airduct:"Luftf\xFChrung",airduct_cooling:"K\xFChlen",airduct_heating:"Heizen",airduct_laser:"Lasermodus",airduct_laser_now:"Gerade im Lasermodus: Den stellt der Drucker f\xFCr sein Lasermodul ein.",airduct_hint:"K\xFChlen holt Frischluft (PLA, TPU), Heizen h\xE4lt die W\xE4rme in der Kammer (ABS, ASA, PC, PA). Der Drucker stellt das bei jedem Druckstart selbst ein.",airduct_busy:"\xC4nderbar, sobald der Druck fertig ist.",backup:"AMS-Filament-Backup",backup_sub:"Ist eine Spule leer, druckt der Drucker mit einer gleichen Spule aus dem AMS weiter: gleiche Marke, gleiches Material, gleiche Farbe.",backup_dual:"Bei zwei D\xFCsen nur Spulen derselben Seite.",backup_unknown:"Zustand unbekannt: BamBuddy meldet ihn f\xFCr diesen Drucker nicht. Ein- und Ausschalten geht trotzdem.",backup_turn_off:"Ausschalten",backup_turn_on:"Einschalten",on:"An",off:"Aus",block_power:"Strom",chip_power:"Strom",power_title:"Strom",plug_printer_tag:"Drucker",plug_today:"heute {energy}",plug_unreachable:"Nicht erreichbar: BamBuddy bekommt keine Antwort von der Steckdose.",plug_unknown:"Zustand unbekannt: Die Steckdose meldet ihn nicht.",plug_run:"Ausf\xFChren",plug_script:"Skript in Home Assistant",plug_monitor:"Nur Anzeige: BamBuddy kann diese Steckdose nicht schalten.",plug_off_title_printer:"Drucker ausschalten?",plug_off_text_printer:"Die Steckdose \u201E{plug}\u201C schaltet den Strom ab. BamBuddy zeigt den Drucker dann als offline; nach dem Einschalten ist er nach etwa einer Minute wieder da.",plug_off_hot:"Die D\xFCse ist noch {temperature} hei\xDF: Ohne Strom steht auch ihr L\xFCfter.",plug_off_hot_left:"Die linke D\xFCse ist noch {temperature} hei\xDF: Ohne Strom steht auch ihr L\xFCfter.",plug_off_hot_right:"Die rechte D\xFCse ist noch {temperature} hei\xDF: Ohne Strom steht auch ihr L\xFCfter.",plug_off_title_print:"Druck abbrechen und ausschalten?",plug_off_text_print:"\u201E{job}\u201C ist bei {progress}. Ohne Strom bricht der Druck ab und l\xE4sst sich nicht fortsetzen.",plug_off_text_print_plain:"Ohne Strom bricht der Druck ab und l\xE4sst sich nicht fortsetzen.",plug_off_print_note:"Nur f\xFCr den Notfall. Stoppe sonst erst den Druck und lass die D\xFCse abk\xFChlen.",plug_off_keep:"Nicht ausschalten",plug_off_text_offline:"BamBuddy erreicht den Drucker nicht und wei\xDF nicht, ob er gerade druckt. Die Steckdose liefert {power} \u2013 l\xE4uft noch ein Druck, bricht er ohne Strom ab.",plug_off_text_offline_plain:"BamBuddy erreicht den Drucker nicht und wei\xDF nicht, ob er gerade druckt. L\xE4uft noch ein Druck, bricht er ohne Strom ab.",plug_off_text_offline_idle:"BamBuddy erreicht den Drucker nicht. Die Steckdose liefert {power} \u2013 so viel wie ein Drucker im Leerlauf; er druckt also wohl nicht.",plug_off_confirm:"Ausschalten",plug_off_title:"\u201E{plug}\u201C ausschalten?",plug_off_text:"Alles, was an dieser Steckdose h\xE4ngt, ist dann ohne Strom.",auto_off_title:"Nach dem Druck ausschalten",auto_off_every:"Nach jedem Druck, sobald die D\xFCse unter {temperature} ist.",auto_off_next:"Nach dem n\xE4chsten Druck, sobald die D\xFCse unter {temperature} ist.",auto_off_disarmed:"Der Drucker bleibt nach dem Druck an.",auto_off_waiting_title:"Wartet aufs Ausschalten",auto_off_waiting:"Sobald die D\xFCse unter {temperature} ist \xB7 jetzt {now}",auto_off_waiting_drying:"Wartet, bis das AMS fertig getrocknet hat.",auto_off_skip:"Diesmal nicht ausschalten",auto_off_skipped:"Diesmal bleibt der Drucker an; nach dem n\xE4chsten Druck schaltet er wieder aus.",auto_off_failed:"Druck abgebrochen oder fehlgeschlagen \u2013 der Drucker bleibt diesmal an.",auto_off_failed_next:"Druck abgebrochen oder fehlgeschlagen \u2013 der Drucker bleibt an.",auto_off_gave_up:"Nicht ausgeschaltet: Der Drucker war in zwei Stunden nicht bereit (die D\xFCse blieb hei\xDF, das AMS trocknete, eine Zieltemperatur war gesetzt oder BamBuddy hat den Drucker verloren), oder die Steckdose hat nicht geantwortet.",auto_off_bambuddy:"BamBuddy schaltet diese Steckdose nach dem Druck schon selbst aus (Auto Aus). Um das hier einzustellen, schalte Auto Aus in BamBuddy ab.",auto_off_bambuddy_view:"BamBuddy schaltet diese Steckdose nach dem Druck schon selbst aus (Auto Aus).",auto_off_done_at:"Nach dem Druck um {time} ausgeschaltet.",auto_off_temperature:"Ausschalten, sobald die D\xFCse k\xFChler ist als",auto_off_when:"Wann",auto_off_every_choice:"Nach jedem Druck",auto_off_next_choice:"Nur nach dem n\xE4chsten Druck",auto_off_dialog_note:"Nur nach einem fertigen Druck \u2013 nie w\xE4hrend eines Drucks oder einer Pause, nie w\xE4hrend das AMS Filament wechselt oder trocknet.",offline_plug_off:"Der Drucker ist aus: Seine Steckdose \u201E{plug}\u201C ist ausgeschaltet.",power_on:"Drucker einschalten",power_starting:"Drucker startet \u2026 {time}",power_starting_text:"BamBuddy verbindet sich meist nach etwa einer Minute.",power_plug_on:"Steckdose an \xB7 {power}",offline_plug_on_power:"Die Steckdose liefert Strom ({power}), aber BamBuddy erreicht den Drucker nicht.",offline_plug_on_zero:"Die Steckdose zeigt 0 W: Ist der Netzschalter am Drucker aus?",chip_power_off:"Strom aus",chip_power_unreachable:"Steckdose nicht erreichbar",chip_power_on:"Strom an",chip_power_plug:"{plug} \xB7 {power}",chip_power_plug_state:"{plug}: {state}",chip_power_unknown:"Strom unbekannt",chip_power_aria:"{shown} \u2013 Steckdose \u201E{plug}\u201C",editor_show_auto_off:"Zeile \u201ENach dem Druck ausschalten\u201C",editor_show_auto_off_help:"Blendet im Bereich \u201EStrom\u201C und im Dialog des Strom-Chips die Zeile unter der Steckdose des Druckers ein oder aus. Mit ihr l\xE4sst sich w\xE4hlen, ob sich der Drucker nach dem Druck von selbst ausschaltet. Ist die Zeile ausgeblendet, schaltet er trotzdem aus, wenn es so eingestellt ist.",auto_off_lower:"Ausschalttemperatur um {step}\xA0{unit} senken",auto_off_raise:"Ausschalttemperatur um {step}\xA0{unit} erh\xF6hen",auto_off_waiting_filament:"Wartet, bis das AMS das Filament gewechselt hat.",auto_off_waiting_heating:"Wartet: Am Drucker ist eine Zieltemperatur eingestellt.",auto_off_waiting_printer:"Wartet, bis BamBuddy den Drucker wieder erreicht.",auto_off_waiting_plug:"Wartet, bis die Steckdose antwortet.",auto_off_switching:"Schaltet aus \u2026",power_off_plug:"Steckdose ausschalten",plug_run_named:"\u201E{plug}\u201C ausf\xFChren"};var oi={picker_name:"BamBuddy printer",picker_description:"Shows and controls a printer from BamBuddy: progress, camera, temperatures, filament and moving the axes.",no_printer:"Choose a printer in the card's settings.",not_found:"This printer is no longer available. In the card's settings, choose it again \u2013 or another one.",not_a_printer:"This device is not a BamBuddy printer. Choose a printer, not an AMS unit, a smart plug or the BamBuddy server.",invalid_option:"Invalid value for \u201C{option}\u201D: {value}. Allowed: {allowed}.",allowed_device:"the ID of a printer device",editor_unavailable:"The visual editor did not load. Edit the card in the code editor (\u201CShow code editor\u201D).",editor_printer:"Printer",editor_printer_help:"A printer of the BamBuddy integration, not an AMS unit.",editor_camera:"Live view",editor_camera_help:"On tap: a tap on the picture starts it. Automatically: it runs while the dashboard is open, using bandwidth all the time. Never: only the job's picture.",camera_tap:"On tap",camera_always:"Automatically",camera_off:"Never",allowed_list:"a list of {values}",editor_group_general:"General",editor_start_hidden:"Warning: the \u201C{tab}\u201D tab is hidden. The card opens on \u201CStatus\u201D.",editor_group_status:"Status",editor_group_control:"Control",editor_group_filament:"Filament",editor_blocks:"Add section",editor_blocks_help:"The sections of the \u201CStatus\u201D tab below the print job. Drag a section where you want it; \xD7 hides it. Print controls and print speed show only during a print, Power only when BamBuddy links a plug to the printer.",sample_job:"Example \u2013 shown during a print",sample_offline:"Example \u2013 shown once the printer is online",sample_unreachable:"Example \u2013 shown once BamBuddy answers",block_controls:"Print controls",block_temperatures:"Temperatures",block_ams:"AMS and filament",block_fans:"Fans",block_speed:"Print speed",editor_chips:"Add chip",editor_chips_help:"The chips below the name. Drag a chip where you want it; \xD7 hides it. Door, SD card / USB drive and drying appear only while the door is open, the storage is missing or an AMS dries; Power only with a smart plug. An HMS error always shows.",chip_network:"Network",chip_hms:"HMS",chip_firmware:"Firmware",chip_maintenance:"Maintenance",chip_door:"Door",chip_storage:"SD card / USB drive",chip_drying:"Drying",editor_start_view:"Tab on opening",editor_control_tab:"\u201CControl\u201D tab",editor_control_tab_help:"Shows or hides the tab with heating, print options, axes and extruder.",editor_sections:"Add section",editor_sections_help:"The sections of the \u201CControl\u201D tab. Drag a section where you want it; \xD7 hides it.",section_heating:"Heating",section_options:"Print options",section_motion:"Axes and extruder",editor_read_only:"Hide controls",editor_read_only_help:"Shows the printer only: the light, heating, the airduct mode and the print options as states, without buttons; the print and filament buttons, drying, the plugs' switches, and the axes and extruder go. No lock: actions, automations and the device page still control it.",editor_filament_tab:"\u201CFilament\u201D tab",editor_filament_tab_help:"Shows or hides the tab with the AMS units and the external spool \u2013 for loading, unloading, setting and drying filament.",editor_ams_folding:"AMS units",editor_ams_folding_help:"Folded shows each unit without its slots; a tap unfolds it.",folding_auto:"Automatic (folded from 3)",folding_folded:"Folded",folding_open:"Unfolded",tab_status:"Status",tab_control:"Control",tab_filament:"Filament",aria_views:"Views",online:"Online",offline:"Offline",light:"Chamber light",light_plain:"Light",dismiss:"Close",error_dismiss:"Dismiss the error",cancel:"Cancel",error_generic:"That did not work. Try again in a moment.",sent:"Sent",ams_activity:"AMS: {state}",more:"More options",menu_device_page:"Open device page",menu_info:"Printer information",menu_refresh:"Refresh status",menu_maintenance:"Maintenance",check_connection:"Check connection",wifi:"Wi-Fi",wifi_signal:"Network: Wi-Fi, {value}, {quality}",wifi_good:"good",wifi_fair:"fair",wifi_weak:"weak",lan:"LAN",lan_aria:"Network: LAN (wired)",lan_wired:"LAN (wired)",hms_ok:"HMS OK",hms_pill:"{count} HMS",hms_pill_aria:"{count} HMS messages",hms_pill_aria_one:"1 HMS message",hms_pill_none:"HMS OK \u2013 no messages",hms_title:"Printer messages (HMS)",hms_none_dialog:"No messages. HMS is the printer's own warning system.",hms_next:"Check the print, then resume or stop it.",hms_next_elsewhere:"Check the print, then resume or stop it at the printer or in BamBuddy.",hms_next_read:"Check the print, then resume or stop it at the printer, in BamBuddy or in Home Assistant.",hms_more:"+{n} more",hms_clear_note:"Clearing only removes the message: errors the printer still sees come back.",firmware:"Firmware",firmware_update:"Firmware {version}: update available",firmware_update_label:"Update {latest} available, firmware {version} installed",firmware_update_chip:"Update {version}",firmware_offline:"Firmware {version} (printer offline)",firmware_unreachable:"Firmware {version} (no data from BamBuddy)",firmware_current:"Firmware {version}: up to date",firmware_version:"Firmware {version}",firmware_installed:"Installed",firmware_latest:"Latest",firmware_available:"Available",firmware_notes:"Release notes",firmware_note:"Install updates on the printer, in Bambu Handy or in BamBuddy.",info_model:"Model",info_name:"Name in BamBuddy",info_server:"BamBuddy server",info_status:"Status",info_print_status:"Print status",info_ip:"IP address",info_serial:"Serial number",info_network:"Network",info_developer:"Developer mode",info_nozzles:"Nozzles",info_hours:"Print hours",info_on:"On",info_off:"Off",info_developer_note:"The printer takes no commands.",nozzle_count_one:"1 nozzle",nozzle_count:"{count} nozzles",nozzle_side:"{side}: {nozzle}",copy_ip:"Copy IP address",copy_serial:"Copy serial number",copied:"Copied",no_job:"No print running",offline_text:"The printer is offline. Check that it is switched on and connected to BamBuddy.",unreachable_text:"No data from BamBuddy. Check that BamBuddy is running, and under Settings \u2192 Devices & services whether it asks for a new API key.",unreachable_text_user:"No data from BamBuddy. Check that BamBuddy is running; an administrator may need to enter a new API key.",unreachable_short:"No data from BamBuddy",layer:"Layer {current} / {total}",remaining:"{time} left",ends:"Ends {time}",progress:"Progress",live:"Live view",live_badge:"Live",live_stop:"Close the live view",camera_failed:"The camera is not available.",fps_value:"{fps} fps",fps_aria:"{fps} frames a second",fps_open:"Set the frame rate",fps_title:"Camera frame rate",fps_lower:"{step} fewer frames a second",fps_raise:"{step} more frames a second",fps_note:"This camera gives up to {max} frames a second. The rate applies to every dashboard and device; by default it is the highest. While someone else watches \u2013 on BamBuddy's own page, say \u2013 BamBuddy may stay at their rate: the chip in the live view shows what arrives.",fps_arriving:"{now} frames a second arrive now. The rate set applies once the live view starts anew while nobody else watches.",fps_restart:"Restart the live view",retry:"Try again",nozzle:"Nozzle",nozzle_left:"Left nozzle",nozzle_right:"Right nozzle",bed:"Bed",chamber:"Chamber",heater_off:"Off",target:"Target {value}",fan_part:"Part cooling",fan_aux:"Auxiliary",fan_chamber:"Chamber",fan_exhaust:"Exhaust",fan_left_aux:"Left auxiliary",fan_hotend:"Hotend",fan_part_name:"Part cooling fan",fan_aux_name:"Auxiliary fan",fan_chamber_name:"Chamber fan",fan_exhaust_name:"Exhaust fan",fan_left_aux_name:"Left auxiliary fan",fan_hotend_name:"Hotend fan",fan_off:"Off",fans:"Fans",open_filament:"Open the filament view",strip_unit:"{name}: {slots}",strip_humidity:"humidity {humidity}",strip_temperature:"temperature {temperature}",side_left_short:"L",side_right_short:"R",external_short:"Ext",hms_error:"Error",hms_warning:"Warning",hms_notice:"Notice",hms_no_text:"{severity}: BamBuddy has no text for this code.",hms_answer_resume_printing:"Resume printing",hms_answer_resume_printing_defects:"Resume (defects acceptable)",hms_answer_resume_printing_probelm_solved:"Resume (problem solved)",hms_answer_problem_solved_resume:"Problem solved, resume",hms_answer_filament_load_resume:"Filament loaded, resume",hms_answer_proceed:"Proceed",hms_answer_dbl_check_resume:"Resume",hms_answer_stop_printing:"Stop printing",hms_answer_ignore_resume:"Ignore and resume",hms_answer_ignore_no_reminder_next_time:"Ignore, don't remind me again",hms_answer_dont_remind_next_time:"Don't remind me again",hms_answer_no_reminder_next_time:"Don't remind me again",hms_answer_filament_extruded:"Filament extruded, continue",hms_answer_dbl_check_done:"Done",hms_answer_retry_filament_extruded:"Not extruded yet, retry",hms_answer_continue:"Finished, continue",hms_answer_retry_problem_solved:"Retry (problem solved)",hms_answer_dbl_check_retry:"Retry",hms_answer_abort:"Abort",hms_answer_ok_button:"OK",hms_answer_dbl_check_ok:"Confirm",hms_answer_refresh_nozzle:"Check again",hms_answer_turn_off_fire_alarm:"Turn off the fire alarm",hms_answer_stop_drying:"Stop drying",hms_answer_disable_purification:"No air purification for this print",hms_wiki:"HMS codes in the Bambu Lab wiki",hms_unknown:"HMS message",hms_count:"HMS errors: {count}",hms_clear:"Clear HMS errors",plate_text:"Take the print off the plate, then tap \u201CPlate cleared\u201D. BamBuddy starts the next queued print only after that.",plate_text_read:"Take the print off the plate. BamBuddy starts the next queued print only once that is confirmed: in BamBuddy, or with \u201CPlate cleared\u201D in Home Assistant.",plate_text_bambuddy:"Take the print off the plate. BamBuddy starts the next queued print only once that is confirmed in BamBuddy.",plate_cleared:"Plate cleared",pause:"Pause print",resume:"Resume print",paused_empty:"No filament loaded. Load one in the Filament tab before resuming.",paused_empty_no_tab:"No filament loaded. Load one before resuming.",stop:"Stop print",speed:"Print speed",developer_off:"The printer takes no commands: its developer LAN mode is off. Turn it on at the printer's screen under Settings \u2192 Network (or WLAN): first \u201CLAN Only Mode\u201D, then \u201CDeveloper Mode\u201D. Then enter the new access code in BamBuddy.",stop_title:"Stop the print?",stop_text:"The print cannot be resumed.",stop_keep:"Keep printing",stop_confirm:"Stop print",skip:"Skip objects",skip_one:"Skip 1 object",skip_many:"Skip {count} objects",skip_text:"Skipped objects cannot be printed again in this job.",skip_loading:"Loading the objects \u2026",skip_none_listed:"BamBuddy lists no objects for this print.",skip_object:"Object {id}",skip_skipped:"Skipped",skip_all:"To skip every object, stop the print instead.",skip_single:"This print has only one object. To leave it out, stop the print.",heating:"Heating",heat_now:"Now {value}",heat_lower:"{what} {step}\xA0{unit} cooler",heat_raise:"{what} {step}\xA0{unit} hotter",heat_start:"{what}: heat to {value}",heat_off:"{what}: turn off",cool_down:"Cool down",active_nozzle:"Active nozzle",nozzle_active:"active",step:"Step",move:"Move {axis} by {distance} mm",home:"Home",slot_named:"{shown} \u2013 {place}",external_left_place:"Left external spool",external_right_place:"Right external spool",heat_target_said:"{what} target:",hours_long:"hours",home_aria:"Home all axes",maint_marked:"\u201C{task}\u201D marked as done.",home_title:"Home all axes?",home_text:"The toolhead moves to its home position; remove anything from the plate first.",bed_axis:"Bed",bed_closer:"Closer",bed_away:"Away",bed_closer_aria:"Move the bed {step} mm closer to the nozzle",bed_away_aria:"Move the bed {step} mm away from the nozzle",nozzle_height:"Nozzle height",nozzle_closer_aria:"Move the nozzle {step} mm closer to the bed",nozzle_away_aria:"Move the nozzle {step} mm away from the bed",extruder:"Extruder",extrude:"Extrude",retract:"Retract",extrude_aria:"Extrude {length} mm of filament",retract_aria:"Retract {length} mm of filament",cold_nozzle:"To extrude, heat the nozzle to at least {temperature} under Heating.",cold_nozzle_left:"To extrude, heat the left nozzle (active) to at least {temperature} under Heating.",cold_nozzle_right:"To extrude, heat the right nozzle (active) to at least {temperature} under Heating.",cold_nozzle_plain:"To extrude, the nozzle must be at least {temperature}.",cold_nozzle_left_plain:"To extrude, the left nozzle (active) must be at least {temperature}.",cold_nozzle_right_plain:"To extrude, the right nozzle (active) must be at least {temperature}.",jog_note:"Tap the house first so the printer knows where it is. It does not stop at the edges \u2013 move in small steps.",busy_reason:"Moving and extruding are possible once the print is done.",changing_reason:"Wait until the filament change is done.",changing_paused:"Wait until the filament change is done, then resume.",detection:"Print options",detection_all_on:"All on",detection_off:"{off} off",detection_all_off:"All off",detection_hint:"On: the printer pauses the print when the detection triggers. Sensitivity as set on the printer. A detection switched off stays off for later prints too.",detection_ai_monitoring:"AI print monitoring",detection_ai_monitoring_x1:"Spaghetti and purge chute pile-ups",detection_first_layer_inspection:"First layer inspection",detection_build_plate_detection:"Build plate detection",detection_build_plate_position_detection:"Build plate position detection",detection_spaghetti_detection:"Spaghetti detection",detection_pileup_detection:"Purge chute pile-up detection",detection_clumping_detection:"Nozzle clumping detection",detection_air_printing_detection:"Air printing detection",external:"External spool",externals:"External spools",left:"Left",right:"Right",humidity:"Humidity",temperature:"Temperature",empty:"Empty",not_set:"Not set",unknown:"Unknown",in_use:"In use",load:"Load",unload:"Unload",load_title_from:"Load {filament} from {place}?",load_title_external:"Load {filament} from the external spool?",load_title_left:"Load {filament} from the left external spool?",load_title_right:"Load {filament} from the right external spool?",load_text:"The printer heats the nozzle, unloads the current filament and loads this one. This takes a few minutes.",load_text_left:"The printer heats the left nozzle, unloads its filament and loads this one. This takes a few minutes.",load_text_right:"The printer heats the right nozzle, unloads its filament and loads this one. This takes a few minutes.",unload_text_left:"The printer heats the left nozzle and pulls its filament back.",unload_text_right:"The printer heats the right nozzle and pulls its filament back.",strip_nozzle_left:"left nozzle",strip_nozzle_right:"right nozzle",unload_title:"Unload the filament?",unload_text:"The printer heats the nozzle and pulls the filament back.",ht_load:"Load filament from the AMS HT on the printer's screen.",filament_pause:"Pause the print to change the filament.",filament_paused:"Print paused: you can change the filament now.",filament_paused_fault:"The printer paused the print: deal with its message first. You can change the filament here, then resume.",paused_change:"The print stays paused. Resume it once the new filament is in.",drying:"Drying \xB7 {time}\xA0left",dry_at_printer:"Start and stop it on the printer's screen.",drying_now:"Drying",drying_at:"Drying at {temperature} \xB7 {time}\xA0left",drying_now_at:"Drying at {temperature}",not_drying:"Not drying",dry:"Dry",dry_stop:"Stop drying",dry_stop_title:"Stop drying?",dry_stop_text:"{unit} has {time} of drying left.",dry_stop_now:"{unit} will stop drying.",dry_keep:"Keep drying",dry_title:"Dry the filament in {unit}",dry_temperature:"Temperature",dry_duration:"Duration",dry_start:"Start drying",dry_suggested:"Suggested for the loaded filament.",dry_suggested_for:"Suggested for the loaded filament: {filaments}.",dry_mixed:"Set for the most heat-sensitive spool: {spools}",dry_temperature_lower:"Lower the temperature",dry_temperature_raise:"Raise the temperature",dry_duration_lower:"Shorten the drying",dry_duration_raise:"Lengthen the drying",set_filament:"Set filament",edit_slot:"Edit {slot}",edit_external:"Edit the external spool",edit_external_left:"Edit the left external spool",edit_external_right:"Edit the right external spool",slot_label:"Slot {slot} \xB7 {unit}",filament_title:"Filament of {slot}",filament_title_external:"Filament of the external spool",filament_title_left:"Filament of the left external spool",filament_title_right:"Filament of the right external spool",material:"Material",material_keep:"Keep {name}",material_choose:"Choose \u2026",color:"Color",color_other:"Other color \u2026",color_current:"Current color",color_chosen:"Chosen color",color_white:"White",color_black:"Black",color_gray:"Gray",color_silver:"Silver",color_red:"Red",color_orange:"Orange",color_yellow:"Yellow",color_green:"Green",color_turquoise:"Turquoise",color_cyan:"Cyan",color_blue:"Blue",color_purple:"Purple",color_pink:"Pink",color_brown:"Brown",color_beige:"Beige",color_gold:"Gold",filament_note:"For spools without a chip. For a new material, the printer uses Bambu Lab's standard settings for it.",filament_set:"Set",filament_rfid:"A Bambu Lab spool with a chip: the AMS reads its material and color from the chip.",k_profile:"K profile (flow dynamics)",k_keep:"Keep {profile}",k_default:"Printer's default (K {k})",k_matching:"Matching {material}",k_others:"Other K profiles on this printer",k_loading:"Asking the printer for its K profiles \u2026",k_none:"The printer lists no K profile for this nozzle, or did not answer in time. To ask again, close the dialog and open it once more.",reset_in_use:"The paused print takes its filament from this slot.",reset_in_use_spool:"The paused print takes its filament from this spool.",hms_next_answers:"Check the print, then answer here as on the printer's screen.",k_keep_number:"Keep K profile no. {index}",k_keep_plain:"Keep the slot's own",k_failed:"The printer did not list its K profiles: the slot keeps its own.",k_other_note:"A K profile of another material: BamBuddy then files the slot under that material.",k_unsure:"If unsure, leave this as it is.",rfid_read:"Read the chip again",rfid_unload_hint:"Unload the filament from {slots} first: the AMS reads a chip only while no filament is loaded.",plug_turn_off:"Turn off",plug_turn_on:"Turn on",plug_turn_off_named:"Turn off \u201C{plug}\u201D",plug_turn_on_named:"Turn on \u201C{plug}\u201D",load_from:"Load from {place}",load_from_external:"Load from the external spool",load_from_left:"Load from the left external spool",load_from_right:"Load from the right external spool",dry_named:"Dry {unit}",dry_stop_named:"Stop drying {unit}",rfid_unload_hint_external:"Unload the filament from the external spool first: the AMS reads a chip only while no filament is loaded.",rfid_unload_hint_left:"Unload the filament from the left external spool first: the AMS reads a chip only while no filament is loaded.",rfid_unload_hint_right:"Unload the filament from the right external spool first: the AMS reads a chip only while no filament is loaded.",k_keep_plain_spool:"Keep the spool's own",k_failed_spool:"The printer did not list its K profiles: the spool keeps its own.",k_other_note_spool:"A K profile of another material: BamBuddy then files the spool under that material.",slot_reset:"Reset slot",spool_reset:"Reset spool",slot_tools_running:"Pause the print first to reset the slot or read its chip again.",spool_tools_running:"Pause the print first to reset the spool.",reset_title:"Reset the slot?",reset_text:"Its material and color are cleared. A spool with a chip shows again once the AMS reads the chip.",reset_title_spool:"Reset the spool?",reset_text_spool:"Its material and color are cleared.",reset_confirm:"Reset",filament_need_material:"Choose a material too.",dur_min:"{m} min",dur_h:"{h} h",dur_hm:"{h} h {m} min",dur_dh:"{d} d {h} h",dur_d:"{d} d",hours:"h",maint_ok:"Maintenance OK",maint_due:"{n} due",maint_ok_aria:"Maintenance OK \u2013 nothing due",maint_due_aria:"{n} due \u2013 maintenance: {overdue} overdue, {soon} due soon",door_open:"Door open",storage_sd:"No SD card",storage_usb:"No USB drive",storage_sd_title_in:"SD card",storage_usb_title_in:"USB drive",storage_sd_text:"Without an SD card BamBuddy cannot send prints to the printer, and prints are archived without a thumbnail. Insert a microSD card.",storage_usb_text:"Without a USB drive BamBuddy cannot send prints to the printer, and prints are archived without a thumbnail. Insert a USB drive.",storage_sd_in:"The SD card is in: BamBuddy can send prints again.",storage_usb_in:"The USB drive is in: BamBuddy can send prints again.",dry_chip_one_bare:"Drying",dry_chip_many_bare:"{n} AMS drying",dry_chip_aria:"{n} AMS units drying, all done in {time}",maint_title:"Maintenance",maint_never:"Never marked as done",maint_overdue:"{time} overdue",maint_soon:"Due soon: in {time}",maint_in:"Due in {time}",maint_done:"Done",maint_done_aria:"Mark \u201C{task}\u201D as done",maint_confirm:"Mark as done? The count starts over.",maint_hours:"Print hours: {hours}",maint_note:"You set up tasks and intervals in BamBuddy.",maint_all_never:"BamBuddy counts from 0 h until a task has been marked done once. Mark what you have done already.",maint_all_never_hidden:"BamBuddy counts from 0 h until a task has been marked done once. You can mark tasks done in BamBuddy \u2013 this card hides its controls.",maint_none:"No maintenance tasks.",maint_task_clean_build_plate:"Clean build plate",maint_task_clean_nozzle:"Clean nozzle and hotend",maint_task_belt_tension:"Check belt tension",maint_task_ptfe_tube:"Check PTFE tube",maint_task_clean_carbon_rods:"Clean carbon rods",maint_task_lubricate_steel_rods:"Lubricate steel rods",maint_task_clean_steel_rods:"Clean steel rods",maint_task_lubricate_rails:"Lubricate linear rails",maint_task_clean_rails:"Clean linear rails",check_again:"Check again",check_running:"Checking the connection \u2026 {s} s",check_running_sr:"Checking the connection \u2026",check_running_hint:"This usually takes a few seconds, at most half a minute.",check_error:"The check could not run: {error}",check_ok:"No problems found.",check_warnings_one:"The printer should work, but 1 thing needs attention.",check_warnings:"The printer should work, but {n} things need attention.",check_problems_one:"1 problem found.",check_problems:"{n} problems found.",check_passed_one:"1 check passed",check_passed:"{n} checks passed",check_skipped:"{n} not checked",check_follows:"Usually follows from the problem above.",check_skip:"Not checked.",check_port_mqtt:"Control (port 8883)",check_port_mqtt_fail:"Not reachable. Is the printer on and still at the same IP address? Is a firewall blocking the port?",check_port_ftps:"File transfer (port 990)",check_port_ftps_warn:"Not reachable: BamBuddy cannot send prints.",check_port_ftps_warn_fix:"Unblock port 990.",check_port_ftps_warn_no_tls:"Port open, but the printer's file service hangs. Restart the printer.",check_port_rtsps:"Camera (port {port})",check_port_rtsps_warn:"Not reachable: no live view. Printing still works.",check_macos_local_network:"macOS: local network",check_macos_local_network_warn_unsigned:"macOS silently blocks the connection. Run BamBuddy's update script (install/update_macos.sh) and restart BamBuddy.",check_macos_local_network_warn_permission:"Allow BamBuddy's Python under System Settings \u2192 Privacy & Security \u2192 Local Network.",check_network_mode:"Container network",check_network_mode_warn:"BamBuddy runs on a bridge network. Printer discovery needs host networking (\u201Cnetwork_mode: host\u201D).",check_network_mode_skip:"Not in a container.",check_network_mode_skip_unknown:"In a container ({runtime}); its network mode could not be determined.",check_network_mode_skip_system_container:"In a system container ({runtime}): not applicable.",check_subnet:"Subnet",check_subnet_warn:"The printer ({printer_ip}) and BamBuddy ({host_ip}) are on different subnets. This works only with routing between them.",check_subnet_skip:"Could not be determined.",check_external_storage:"Files on external storage",check_external_storage_fail:"Off on the printer: archives get no thumbnail. Turn on \u201CStore sent files on external storage\u201D \u2013 in the printer's print settings or in the slicer's Device tab.",check_external_storage_fail_no_media:"No SD card or USB drive in the printer: prints cannot be sent. Insert one.",check_external_storage_warn_internal_storage:"The last print sat in internal storage, which BamBuddy cannot read: it was archived without a thumbnail. Start prints from BamBuddy, or use \u201CSend\u201D with \u201CExternal\u201D in the slicer.",check_external_storage_warn_internal_history:"The last print came from the printer's own storage: archived without a thumbnail. Start prints from BamBuddy or the slicer.",check_external_storage_skip_unsupported_model:"Cannot be set on the P1. Nothing to do.",check_mqtt_auth:"Credentials",check_mqtt_auth_fail:"Reachable but not connected. Usually the access code changed: it does whenever LAN Only or Developer Mode is switched. Enter it again in BamBuddy.",check_mqtt_auth_fail_auth_rejected:"The printer rejects the access code or serial number. Read the access code on its screen and enter it again in BamBuddy.",check_mqtt_auth_skip:"Not checked: port 8883 cannot be reached.",check_developer_mode:"Developer mode (LAN)",check_developer_mode_skip:"Not checked: needs a live connection to the printer.",check_printer_publishing:"Status reports",check_printer_publishing_fail:"Connected, but the printer reports nothing. Usually the serial number in BamBuddy is mistyped (case matters).",check_printer_publishing_skip:"Not checked: needs a live connection to the printer.",airduct:"Airduct mode",airduct_cooling:"Cooling",airduct_heating:"Heating",airduct_laser:"Laser mode",airduct_laser_now:"Now in laser mode: the printer sets it for its laser module.",airduct_hint:"Cooling draws in fresh air (PLA, TPU); Heating keeps the warmth in the chamber (ABS, ASA, PC, PA). The printer sets it itself at every print start.",airduct_busy:"Can be changed once the print is done.",backup:"AMS filament backup",backup_sub:"When a spool runs out, the printer continues with a matching spool from the AMS: same brand, material and color.",backup_dual:"With two nozzles, only spools on the same side.",backup_unknown:"State unknown: BamBuddy does not report it for this printer. Switching it on or off still works.",backup_turn_off:"Turn off",backup_turn_on:"Turn on",on:"On",off:"Off",block_power:"Power",chip_power:"Power",power_title:"Power",plug_printer_tag:"Printer",plug_today:"today {energy}",plug_unreachable:"Not reachable: BamBuddy gets no answer from the plug.",plug_unknown:"State unknown: the plug does not report it.",plug_run:"Run",plug_script:"Script in Home Assistant",plug_monitor:"Display only: BamBuddy cannot switch this plug.",plug_off_title_printer:"Switch the printer off?",plug_off_text_printer:"The plug \u201C{plug}\u201D cuts the power. BamBuddy then shows the printer as offline; after switching it on, it is back in about a minute.",plug_off_hot:"The nozzle is still at {temperature}: without power, its fan stops too.",plug_off_hot_left:"The left nozzle is still at {temperature}: without power, its fan stops too.",plug_off_hot_right:"The right nozzle is still at {temperature}: without power, its fan stops too.",plug_off_title_print:"Cancel the print and switch off?",plug_off_text_print:"\u201C{job}\u201D is at {progress}. Without power the print stops and cannot be resumed.",plug_off_text_print_plain:"Without power the print stops and cannot be resumed.",plug_off_print_note:"Only in an emergency. Otherwise stop the print first and let the nozzle cool.",plug_off_keep:"Keep it on",plug_off_text_offline:"BamBuddy cannot reach the printer and does not know whether it is printing. The plug delivers {power} \u2013 a running print would stop without power.",plug_off_text_offline_plain:"BamBuddy cannot reach the printer and does not know whether it is printing. A running print would stop without power.",plug_off_text_offline_idle:"BamBuddy cannot reach the printer. The plug delivers {power} \u2013 about what an idle printer draws, so it is most likely not printing.",plug_off_confirm:"Switch off",plug_off_title:"Switch \u201C{plug}\u201D off?",plug_off_text:"Everything plugged into it loses power.",auto_off_title:"Switch off after the print",auto_off_every:"After every print, once the nozzle is below {temperature}.",auto_off_next:"After the next print, once the nozzle is below {temperature}.",auto_off_disarmed:"The printer stays on after the print.",auto_off_waiting_title:"Waiting to switch off",auto_off_waiting:"Once the nozzle is below {temperature} \xB7 now {now}",auto_off_waiting_drying:"Waits until the AMS has finished drying.",auto_off_skip:"Don't switch off this time",auto_off_skipped:"The printer stays on this time; it switches off again after the next print.",auto_off_failed:"Print stopped or failed \u2013 the printer stays on this time.",auto_off_failed_next:"Print stopped or failed \u2013 the printer stays on.",auto_off_gave_up:"Not switched off: the printer was not ready within two hours (the nozzle stayed hot, the AMS was drying, a target was set or BamBuddy lost the printer), or the plug did not answer.",auto_off_bambuddy:"BamBuddy already switches this plug off after the print (Auto Off). To set it here instead, turn Auto Off off in BamBuddy.",auto_off_bambuddy_view:"BamBuddy already switches this plug off after the print (Auto Off).",auto_off_done_at:"Switched off after the print at {time}.",auto_off_temperature:"Switch off once the nozzle is cooler than",auto_off_when:"When",auto_off_every_choice:"After every print",auto_off_next_choice:"Only after the next print",auto_off_dialog_note:"Only after a finished print \u2013 never during a print or a pause, never while the AMS changes filament or dries.",offline_plug_off:"The printer is off: its plug \u201C{plug}\u201D is switched off.",power_on:"Switch the printer on",power_starting:"Printer starting \u2026 {time}",power_starting_text:"BamBuddy usually connects after about a minute.",power_plug_on:"Plug on \xB7 {power}",offline_plug_on_power:"The plug delivers power ({power}), but BamBuddy cannot reach the printer.",offline_plug_on_zero:"The plug shows 0 W: is the printer's own power switch off?",chip_power_off:"Power off",chip_power_unreachable:"Plug unreachable",chip_power_on:"Power on",chip_power_plug:"{plug} \xB7 {power}",chip_power_plug_state:"{plug}: {state}",chip_power_unknown:"Power unknown",chip_power_aria:"{shown} \u2013 plug \u201C{plug}\u201D",editor_show_auto_off:"\u201CSwitch off after the print\u201D row",editor_show_auto_off_help:"Shows or hides the row under the printer's plug in the Power section and the Power chip's dialog. In it you choose whether the printer switches itself off after the print. With the row hidden, it still switches off if set to.",auto_off_lower:"Lower the switch-off temperature by {step}\xA0{unit}",auto_off_raise:"Raise the switch-off temperature by {step}\xA0{unit}",auto_off_waiting_filament:"Waits until the AMS has changed the filament.",auto_off_waiting_heating:"Waits: a target temperature is set on the printer.",auto_off_waiting_printer:"Waits until BamBuddy reaches the printer again.",auto_off_waiting_plug:"Waits until the plug answers.",auto_off_switching:"Switching off \u2026",power_off_plug:"Switch the plug off",plug_run_named:"Run \u201C{plug}\u201D"};var ue={en:oi,de:ai},ba=t=>t in ue,si="en",wa=t=>{let e=t.toLowerCase().replace(/[-_].*$/,"");return ba(e)?e:"en"};function he(t){let e=t??document.querySelector("home-assistant")?.hass;return e?wa(e.locale.language):si}function li(t){si=he(t)}function o(t,e,n={}){return ue[he(t)][e].replace(/\{(\w+)\}/g,(i,r)=>r in n?String(n[r]):i)}async function Wt(t,e,n,i){await t.callService(e,n,i,void 0,!1)}async function De(t,e){let n=typeof e=="object"&&e!==null?e:{},i=n.translation_domain,r=n.translation_key;if(i&&r)try{let s=(await t.loadBackendTranslation("exceptions",i))(`component.${i}.exceptions.${r}.message`,n.translation_placeholders??{});if(s)return s}catch{}return typeof n.message=="string"&&n.message?n.message:o(t,"error_generic")}async function qe(t,e,n){return(await t.callService("bambuddy",e,n,void 0,!1,!0))?.response??{}}var Ye=(t,e,n)=>(Array.isArray(t)?t:[]).filter(i=>typeof i=="object"&&i!==null&&typeof i[e]===n);async function di(t,e){let n=await qe(t,"get_k_profiles",{entity_id:e});return{current:typeof n.current=="number"?n.current:-1,profiles:Ye(n.profiles,"index","number").map(i=>({index:i.index,name:typeof i.name=="string"?i.name:"",k:typeof i.k_value=="number"?i.k_value:0,filamentId:typeof i.filament_id=="string"?i.filament_id:""}))}}async function ci(t,e){let n=await qe(t,"get_print_objects",{device_id:e});return Ye(n.objects,"id","number").map(i=>({id:i.id,name:typeof i.name=="string"?i.name:"",skipped:i.skipped===!0}))}var pi=new Set(["unavailable","unknown"]),w=(t,e)=>e?t.states[e]:void 0;function z(t,e){let n=w(t,e);return!!n&&!pi.has(n.state)}function k(t,e){let n=w(t,e);if(!n||n.state.trim()==="")return;let i=Number(n.state);return Number.isFinite(i)?i:void 0}var ya={d:1440,h:60,min:1,s:1/60,ms:1/6e4};function me(t,e){let n=k(t,e),i=w(t,e)?.attributes.unit_of_measurement;return n===void 0?void 0:n*(ya[typeof i=="string"?i:"min"]??1)}function O(t,e){let n=w(t,e)?.attributes.unit_of_measurement;return n==="\xB0F"||n==="K"?n:"\xB0C"}var j=(t,e)=>Math.round(e==="\xB0F"?t*1.8+32:e==="K"?t+273.15:t),Zt=(t,e)=>e==="\xB0F"?(t-32)/1.8:e==="K"?t-273.15:t;function oe(t,e){let n=w(t,e)?.attributes.min;return typeof n=="number"?n:0}var fe=t=>typeof t=="string"&&t?t:void 0;function ge(t,e,n){let i=t.attributes.options;return Array.isArray(i)&&(n||i.length>0)&&i.every(r=>typeof r=="string")?i:e}function D(t,e,n){let i=w(t,e);if(!(!i||n===void 0&&pi.has(i.state)))return n===void 0?t.formatEntityState(i):t.formatEntityState(i,n)}function ui(t){switch(t.locale.number_format){case"comma_decimal":return"en-US";case"decimal_comma":return"de";case"space_comma":return"fr";case"quote_decimal":return"de-CH";case"system":return;default:return t.locale.language}}function A(t,e,n=0){return new Intl.NumberFormat(ui(t),{maximumFractionDigits:n,useGrouping:t.locale.number_format!=="none"}).format(e)}var L=(t,e,n="\xB0C")=>`${A(t,e)}\xA0${n}`,N=(t,e,n)=>L(t,n,O(t,e));function qt(t,e,n){return new Intl.NumberFormat(ui(t),{minimumFractionDigits:n,maximumFractionDigits:n}).format(e)}var M=(t,e)=>`${A(t,e)}\xA0%`,_e=(t,e)=>Math.abs(e)>=1e3?`${A(t,e/1e3,1)}\xA0kW`:`${A(t,e)}\xA0W`,hi=(t,e)=>`${A(t,e,2)}\xA0kWh`;function G(t,e){let n=Math.max(0,Math.round(e)),i=Math.floor(n/1440),r=Math.floor(n%1440/60),a=n%60;return i>0?r===0?o(t,"dur_d",{d:i}):o(t,"dur_dh",{d:i,h:r}):r===0?o(t,"dur_min",{m:a}):a===0?o(t,"dur_h",{h:r}):o(t,"dur_hm",{h:r,m:a})}function va(t){switch(t.locale.time_format){case"12":return!0;case"24":return!1;case"system":return new Intl.DateTimeFormat(void 0,{hour:"numeric"}).resolvedOptions().hour12;default:return}}function xa(t){return t.locale.time_zone==="server"?t.config?.time_zone:void 0}function Xe(t,e,n=new Date){let i=new Date(e);if(Number.isNaN(i.getTime()))return;let r=xa(t),a=t.locale.language,s=l=>new Intl.DateTimeFormat("en-CA",{timeZone:r,dateStyle:"short"}).format(l),d=s(i)===s(n);return new Intl.DateTimeFormat(a,{timeZone:r,hour:"numeric",minute:"2-digit",hour12:va(t),...d?{}:{weekday:"short"}}).format(i)}var Y=new Set(["printing","paused","preparing","slicing"]),mi=new Set(["printing","preparing","slicing"]),fi=new Set(["heating","feeding","retracting","verifying","purging","changing_filament"]),Je=new Set(["printing","paused","preparing","slicing","finished","failed"]);function Yt(t){switch(t){case"printing":case"preparing":case"slicing":return"active";case"paused":return"paused";case"finished":return"done";case"failed":return"failed";case"idle":return"idle";default:return"off"}}function gi(t){return typeof t=="string"&&/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(t)?t.slice(0,7):void 0}var Xt=t=>[1,3,5].map(e=>parseInt(t.slice(e,e+2),16));function ka(t){let[e,n,i]=Xt(t).map(r=>r/255);return .2126*e+.7152*n+.0722*i}function Qe(t){let e=ka(t);return e>.85||e<.12}var et=t=>t.replace(/(\.gcode)?\.(3mf|gcode)$/i,"")||t;var $a={pause:"M14,19H18V5H14M6,19H10V5H6V19Z",play:"M8,5.14V19.14L19,12.14L8,5.14Z",stop:"M18,18H6V6H18V18Z",lightOn:"M12,6A6,6 0 0,1 18,12C18,14.22 16.79,16.16 15,17.2V19A1,1 0 0,1 14,20H10A1,1 0 0,1 9,19V17.2C7.21,16.16 6,14.22 6,12A6,6 0 0,1 12,6M14,21V22A1,1 0 0,1 13,23H11A1,1 0 0,1 10,22V21H14M20,11H23V13H20V11M1,11H4V13H1V11M13,1V4H11V1H13M4.92,3.5L7.05,5.64L5.63,7.05L3.5,4.93L4.92,3.5M16.95,5.63L19.07,3.5L20.5,4.93L18.37,7.05L16.95,5.63Z",lightOff:"M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21M12,4A5,5 0 0,0 7,9C7,11.05 8.23,12.81 10,13.58V16H14V13.58C15.77,12.81 17,11.05 17,9A5,5 0 0,0 12,4Z",nozzle:"M7,2H17V8H19V13H16.5L13,17H11L7.5,13H5V8H7V2M10,22H2V20H10A1,1 0 0,0 11,19V18H13V19A3,3 0 0,1 10,22Z",bed:"M7.95,3L6.53,5.19L7.95,7.4H7.94L5.95,10.5L4.22,9.6L5.64,7.39L4.22,5.19L6.22,2.09L7.95,3M13.95,2.89L12.53,5.1L13.95,7.3L13.94,7.31L11.95,10.4L10.22,9.5L11.64,7.3L10.22,5.1L12.22,2L13.95,2.89M20,2.89L18.56,5.1L20,7.3V7.31L18,10.4L16.25,9.5L17.67,7.3L16.25,5.1L18.25,2L20,2.89M2,22V14A2,2 0 0,1 4,12H20A2,2 0 0,1 22,14V22H20V20H4V22H2M6,14A1,1 0 0,0 5,15V17A1,1 0 0,0 6,18A1,1 0 0,0 7,17V15A1,1 0 0,0 6,14M10,14A1,1 0 0,0 9,15V17A1,1 0 0,0 10,18A1,1 0 0,0 11,17V15A1,1 0 0,0 10,14M14,14A1,1 0 0,0 13,15V17A1,1 0 0,0 14,18A1,1 0 0,0 15,17V15A1,1 0 0,0 14,14M18,14A1,1 0 0,0 17,15V17A1,1 0 0,0 18,18A1,1 0 0,0 19,17V15A1,1 0 0,0 18,14Z",chamber:"M15 13V5A3 3 0 0 0 9 5V13A5 5 0 1 0 15 13M12 4A1 1 0 0 1 13 5V8H11V5A1 1 0 0 1 12 4Z",fan:"M12,11A1,1 0 0,0 11,12A1,1 0 0,0 12,13A1,1 0 0,0 13,12A1,1 0 0,0 12,11M12.5,2C17,2 17.11,5.57 14.75,6.75C13.76,7.24 13.32,8.29 13.13,9.22C13.61,9.42 14.03,9.73 14.35,10.13C18.05,8.13 22.03,8.92 22.03,12.5C22.03,17 18.46,17.1 17.28,14.73C16.78,13.74 15.72,13.3 14.79,13.11C14.59,13.59 14.28,14 13.88,14.34C15.87,18.03 15.08,22 11.5,22C7,22 6.91,18.42 9.27,17.24C10.25,16.75 10.69,15.71 10.89,14.79C10.4,14.59 9.97,14.27 9.65,13.87C5.96,15.85 2,15.07 2,11.5C2,7 5.56,6.89 6.74,9.26C7.24,10.25 8.29,10.68 9.22,10.87C9.41,10.39 9.73,9.97 10.14,9.65C8.15,5.96 8.94,2 12.5,2Z",home:"M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z",up:"M13,20H11V8L5.5,13.5L4.08,12.08L12,4.16L19.92,12.08L18.5,13.5L13,8V20Z",down:"M11,4H13V16L18.5,10.5L19.92,11.92L12,19.84L4.08,11.92L5.5,10.5L11,16V4Z",left:"M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z",right:"M4,11V13H16L10.5,18.5L11.92,19.92L19.84,12L11.92,4.08L10.5,5.5L16,11H4Z",chevronRight:"M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z",chevronDown:"M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z",humidity:"M12,3.25C12,3.25 6,10 6,14C6,17.32 8.69,20 12,20A6,6 0 0,0 18,14C18,10 12,3.25 12,3.25M14.47,9.97L15.53,11.03L9.53,17.03L8.47,15.97M9.75,10A1.25,1.25 0 0,1 11,11.25A1.25,1.25 0 0,1 9.75,12.5A1.25,1.25 0 0,1 8.5,11.25A1.25,1.25 0 0,1 9.75,10M14.25,14.5A1.25,1.25 0 0,1 15.5,15.75A1.25,1.25 0 0,1 14.25,17A1.25,1.25 0 0,1 13,15.75A1.25,1.25 0 0,1 14.25,14.5Z",error:"M13 13H11V7H13M11 15H13V17H11M15.73 3H8.27L3 8.27V15.73L8.27 21H15.73L21 15.73V8.27L15.73 3Z",warning:"M13 14H11V9H13M13 18H11V16H13M1 21H23L12 2L1 21Z",info:"M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",wrench:"M22.7,19L13.6,9.9C14.5,7.6 14,4.9 12.1,3C10.1,1 7.1,0.6 4.7,1.7L9,6L6,9L1.6,4.7C0.4,7.1 0.9,10.1 2.9,12.1C4.8,14 7.5,14.5 9.8,13.6L18.9,22.7C19.3,23.1 19.9,23.1 20.3,22.7L22.6,20.4C23.1,20 23.1,19.3 22.7,19Z",doorOpen:"M12,3C10.89,3 10,3.89 10,5H3V19H2V21H22V19H21V5C21,3.89 20.11,3 19,3H12M12,5H19V19H12V5M5,11H7V13H5V11Z",sd:"M18,8H16V4H18M15,8H13V4H15M12,8H10V4H12M18,2H10L4,8V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V4A2,2 0 0,0 18,2Z",usb:"M15,7V11H16V13H13V5H15L12,1L9,5H11V13H8V10.93C8.7,10.56 9.2,9.85 9.2,9C9.2,7.78 8.21,6.8 7,6.8C5.78,6.8 4.8,7.78 4.8,9C4.8,9.85 5.3,10.56 6,10.93V13A2,2 0 0,0 8,15H11V18.05C10.29,18.41 9.8,19.15 9.8,20A2.2,2.2 0 0,0 12,22.2A2.2,2.2 0 0,0 14.2,20C14.2,19.15 13.71,18.41 13,18.05V15H16A2,2 0 0,0 18,13V11H19V7H15Z",tune:"M3,17V19H9V17H3M3,5V7H13V5H3M13,21V19H21V17H13V15H11V21H13M7,9V11H3V13H7V15H9V9H7M21,13V11H11V13H21M15,9H17V7H21V5H17V3H15V9Z",lan:"M10,2C8.89,2 8,2.89 8,4V7C8,8.11 8.89,9 10,9H11V11H2V13H6V15H5C3.89,15 3,15.89 3,17V20C3,21.11 3.89,22 5,22H9C10.11,22 11,21.11 11,20V17C11,15.89 10.11,15 9,15H8V13H16V15H15C13.89,15 13,15.89 13,17V20C13,21.11 13.89,22 15,22H19C20.11,22 21,21.11 21,20V17C21,15.89 20.11,15 19,15H18V13H22V11H13V9H14C15.11,9 16,8.11 16,7V4C16,2.89 15.11,2 14,2H10M10,4H14V7H10V4M5,17H9V20H5V17M15,17H19V20H15V17Z",close:"M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z",cog:"M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z",video:"M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z",videoOff:"M3.27,2L2,3.27L4.73,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16C16.2,18 16.39,17.92 16.54,17.82L19.73,21L21,19.73M21,6.5L17,10.5V7A1,1 0 0,0 16,6H9.82L21,17.18V6.5Z",load:"M2 12H4V17H20V12H22V17C22 18.11 21.11 19 20 19H4C2.9 19 2 18.11 2 17V12M12 15L17.55 9.54L16.13 8.13L13 11.25V2H11V11.25L7.88 8.13L6.46 9.55L12 15Z",unload:"M2 12H4V17H20V12H22V17C22 18.11 21.11 19 20 19H4C2.9 19 2 18.11 2 17V12M12 2L6.46 7.46L7.88 8.88L11 5.75V15H13V5.75L16.13 8.88L17.55 7.45L12 2Z",speed:"M12,16A3,3 0 0,1 9,13C9,11.88 9.61,10.9 10.5,10.39L20.21,4.77L14.68,14.35C14.18,15.33 13.17,16 12,16M12,3C13.81,3 15.5,3.5 16.97,4.32L14.87,5.53C14,5.19 13,5 12,5A8,8 0 0,0 4,13C4,15.21 4.89,17.21 6.34,18.65H6.35C6.74,19.04 6.74,19.67 6.35,20.06C5.96,20.45 5.32,20.45 4.93,20.07V20.07C3.12,18.26 2,15.76 2,13A10,10 0 0,1 12,3M22,13C22,15.76 20.88,18.26 19.07,20.07V20.07C18.68,20.45 18.05,20.45 17.66,20.06C17.27,19.67 17.27,19.04 17.66,18.65V18.65C19.11,17.2 20,15.21 20,13C20,12 19.81,11 19.46,10.1L20.67,8C21.5,9.5 22,11.18 22,13Z",check:"M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z",restore:"M13,3A9,9 0 0,0 4,12H1L4.89,15.89L4.96,16.03L9,12H6A7,7 0 0,1 13,5A7,7 0 0,1 20,12A7,7 0 0,1 13,19C11.07,19 9.32,18.21 8.06,16.94L6.64,18.36C8.27,20 10.5,21 13,21A9,9 0 0,0 22,12A9,9 0 0,0 13,3Z",ready:"M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",skip:"M16,18H18V6H16M6,18L14.5,12L6,6V18Z",sync:"M12,18A6,6 0 0,1 6,12C6,11 6.25,10.03 6.7,9.2L5.24,7.74C4.46,8.97 4,10.43 4,12A8,8 0 0,0 12,20V23L16,19L12,15M12,4V1L8,5L12,9V6A6,6 0 0,1 18,12C18,13 17.75,13.97 17.3,14.8L18.76,16.26C19.54,15.03 20,13.57 20,12A8,8 0 0,0 12,4Z",plug:"M16,7V3H14V7H10V3H8V7C7,7 6,8 6,9V14.5L9.5,18V21H14.5V18L18,14.5V9C18,8 17,7 16,7Z",plugOff:"M8,3V6.18C11.1,9.23 14.1,12.3 17.2,15.3C17.4,15 17.8,14.8 18,14.4V9C18,8 17,7 16,7V3H14V7H10V3M3.28,4C2.85,4.4 2.85,5.16 3.28,5.53L6,8.25V14.5L9.5,18V21H14.5V18L15.47,17.03L18.27,19.83C18.64,20.22 19.38,20.22 19.8,19.83C20.24,19.4 20.24,18.65 19.8,18.21L4.83,3.24C4.4,2.82 3.7,2.82 3.28,3.24",bolt:"M11 15H6L13 1V9H18L11 23V15Z",script:"M14 20A2 2 0 0 0 16 18V5H9A1 1 0 0 0 8 6V16H5V5A3 3 0 0 1 8 2H19A3 3 0 0 1 22 5V6H18V18L18 19A3 3 0 0 1 15 22H5A3 3 0 0 1 2 19V18H12A2 2 0 0 0 14 20M10 13V8L14 10.5Z",timerOff:"M19.04 4.55L17.62 5.97C16.07 4.74 14.12 4 12 4C9.17 4 6.65 5.31 5 7.36L6.43 8.79C7.71 7.08 9.72 6 12 6C15.87 6 19 9.13 19 13C19 14.15 18.72 15.24 18.22 16.2L19.69 17.67C20.53 16.32 21 14.72 21 13C21 10.88 20.26 8.93 19.03 7.39L20.45 5.97L19.04 4.55M15 1H9V3H15V1M11 9.17L13 11.17V8H11V9.17M3.02 4L1.75 5.27L4.5 8.03C3.55 9.45 3 11.16 3 13C3 17.97 7.03 22 12 22C13.84 22 15.55 21.45 17 20.5L19.5 23L20.75 21.73L3.02 4M12 20C8.13 20 5 16.87 5 13C5 11.72 5.35 10.5 5.95 9.5L15.5 19.04C14.5 19.65 13.28 20 12 20Z",power:"M16.56,5.44L15.11,6.89C16.84,7.94 18,9.83 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12C6,9.83 7.16,7.94 8.88,6.88L7.44,5.44C5.36,6.88 4,9.28 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,9.28 18.64,6.88 16.56,5.44M13,3H11V13H13",snow:"M20.79,13.95L18.46,14.57L16.46,13.44V10.56L18.46,9.43L20.79,10.05L21.31,8.12L19.54,7.65L20,5.88L18.07,5.36L17.45,7.69L15.45,8.82L13,7.4V5.11L14.71,3.4L13.29,2L12,3.29L10.71,2L9.29,3.4L11,5.11V7.4L8.5,8.82L6.5,7.69L5.92,5.36L4,5.88L4.47,7.65L2.7,8.12L3.22,10.05L5.55,9.43L7.55,10.56V13.45L5.55,14.58L3.22,13.96L2.7,15.89L4.47,16.36L4,18.12L5.93,18.64L6.55,16.31L8.55,15.18L11,16.6V18.89L9.29,20.6L10.71,22L12,20.71L13.29,22L14.7,20.6L13,18.89V16.6L15.5,15.17L17.5,16.3L18.12,18.63L20,18.12L19.53,16.35L21.3,15.88L20.79,13.95M9.5,10.56L12,9.11L14.5,10.56V13.44L12,14.89L9.5,13.44V10.56Z",heat:"M8.5 4.5L5.4 9.5L8.5 14.7L5.2 20.5L3.4 19.6L6.1 14.7L3 9.5L6.7 3.6L8.5 4.5M14.7 4.4L11.6 9.5L14.7 14.5L11.4 20.3L9.6 19.4L12.3 14.5L9.2 9.5L12.9 3.5L14.7 4.4M21 4.4L17.9 9.5L21 14.5L17.7 20.3L15.9 19.4L18.6 14.5L15.5 9.5L19.2 3.5L21 4.4",layers:"M12,16L19.36,10.27L21,9L12,2L3,9L4.63,10.27M12,18.54L4.62,12.81L3,14.07L12,21.07L21,14.07L19.37,12.8L12,18.54Z",timer:"M12,20A7,7 0 0,1 5,13A7,7 0 0,1 12,6A7,7 0 0,1 19,13A7,7 0 0,1 12,20M19.03,7.39L20.45,5.97C20,5.46 19.55,5 19.04,4.56L17.62,6C16.07,4.74 14.12,4 12,4A9,9 0 0,0 3,13A9,9 0 0,0 12,22C17,22 21,17.97 21,13C21,10.88 20.26,8.93 19.03,7.39M11,14H13V8H11M15,1H9V3H15V1Z",clock:"M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z",pencil:"M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z",palette:"M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z",eye:"M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z",minus:"M19,13H5V11H19V13Z",plus:"M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z",offline:"M2.28,3L1,4.27L2.47,5.74C2.04,6 1.61,6.29 1.2,6.6L3,9C3.53,8.6 4.08,8.25 4.66,7.93L6.89,10.16C6.15,10.5 5.44,10.91 4.8,11.4L6.6,13.8C7.38,13.22 8.26,12.77 9.2,12.47L11.75,15C10.5,15.07 9.34,15.5 8.4,16.2L12,21L14.46,17.73L17.74,21L19,19.72M12,3C9.85,3 7.8,3.38 5.9,4.07L8.29,6.47C9.5,6.16 10.72,6 12,6C15.38,6 18.5,7.11 21,9L22.8,6.6C19.79,4.34 16.06,3 12,3M12,9C11.62,9 11.25,9 10.88,9.05L14.07,12.25C15.29,12.53 16.43,13.07 17.4,13.8L19.2,11.4C17.2,9.89 14.7,9 12,9Z",dotsVertical:"M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z",wifi:"M12,21L15.6,16.2C14.6,15.45 13.35,15 12,15C10.65,15 9.4,15.45 8.4,16.2L12,21M12,3C7.95,3 4.21,4.34 1.2,6.6L3,9C5.5,7.12 8.62,6 12,6C15.38,6 18.5,7.12 21,9L22.8,6.6C19.79,4.34 16.05,3 12,3M12,9C9.3,9 6.81,9.89 4.8,11.4L6.6,13.8C8.1,12.67 9.97,12 12,12C14.03,12 15.9,12.67 17.4,13.8L19.2,11.4C17.19,9.89 14.7,9 12,9Z",ethernet:"M7,15H9V18H11V15H13V18H15V15H17V18H18V9H15V6H9V9H6V18H7V15M4.38,3H19.63C20.94,3 22,4.06 22,5.38V19.63A2.37,2.37 0 0,1 19.63,22H4.38C3.06,22 2,20.94 2,19.63V5.38C2,4.06 3.06,3 4.38,3Z",shieldCheck:"M10,17L6,13L7.41,11.59L10,14.17L16.59,7.58L18,9M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z",shieldAlert:"M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M11,7H13V13H11V7M11,15H13V17H11V15Z",download:"M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z",memory:"M17,17H7V7H17M21,11V9H19V7C19,5.89 18.1,5 17,5H15V3H13V5H11V3H9V5H7C5.89,5 5,5.89 5,7V9H3V11H5V13H3V15H5V17A2,2 0 0,0 7,19H9V21H11V19H13V21H15V19H17A2,2 0 0,0 19,17V15H21V13H19V11M13,13H11V11H13M15,9H9V15H15V9Z",copy:"M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z",refresh:"M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z",infoOutline:"M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z",openInNew:"M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z"},_=t=>jt`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d=${$a[t]}></path></svg>`,_i=()=>jt`<svg class="drawing" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
  <rect class="d-body" x="14" y="10" width="92" height="100" rx="10"></rect>
  <rect class="d-window" x="24" y="20" width="72" height="66" rx="5"></rect>
  <line class="d-line" x1="28" y1="36" x2="92" y2="36"></line>
  <path class="d-head" d="M52 31h16v11h-4l-4 5-4-5h-4z"></path>
  <rect class="d-part" x="50" y="64" width="20" height="12" rx="2"></rect>
  <line class="d-line" x1="32" y1="77" x2="88" y2="77"></line>
  <rect class="d-base" x="24" y="92" width="72" height="8" rx="3"></rect>
</svg>`;var tt=(t,e,n)=>({title:o(t,"stop_title"),text:o(t,"stop_text"),confirm:o(t,"stop_confirm"),keep:o(t,"stop_keep"),danger:!0,action:e,key:n});function x(t){let{label:e,iconName:n,onClick:i,kind:r="tonal",disabled:a=!1,pending:s=!1,iconOnly:d=!1,aria:l,className:u="",describedBy:f,answer:m}=t;return c`<button
    class="btn ${r} ${d?"icon-only":""} ${s?"pending":""} ${u}"
    ?disabled=${a}
    aria-disabled=${s?"true":p}
    aria-busy=${s?"true":"false"}
    aria-label=${l??e}
    aria-describedby=${f??p}
    data-answer=${m??p}
    title=${l??e}
    @click=${s?p:i}
  >
    ${_(n)}${d?p:c`<span>${e}</span>`}
  </button>`}function W(t){let e=[...t.currentTarget.querySelectorAll("[role=radio]")],n=e.indexOf(t.target),i={ArrowRight:n+1,ArrowDown:n+1,ArrowLeft:n-1,ArrowUp:n-1,Home:0,End:e.length-1};if(n<0||!(t.key in i))return;t.preventDefault();let r=e[(i[t.key]+e.length)%e.length];for(let a of e)a.tabIndex=a===r?0:-1;r?.focus()}function Z(t){let e=t.currentTarget;if(t.relatedTarget instanceof Node&&e.contains(t.relatedTarget))return;let n=[...e.querySelectorAll("[role=radio]")],i=n.find(r=>r.getAttribute("aria-checked")==="true")??n[0];for(let r of n)r.tabIndex=r===i?0:-1}var X=(t,e)=>Math.max(0,t.indexOf(e)),bi=(t,e)=>o(t.hass,t.unreachable?t.hass.user?.is_admin===!1?"unreachable_text_user":"unreachable_text":e),be=t=>t.online?"online":t.unreachable?"unreachable_short":"offline",Le=t=>({...t,online:!0,unreachable:!1}),nt=(t,e=!1)=>e||t.online?"sample_job":t.unreachable?"sample_unreachable":"sample_offline";function it(t,e,n){return c`<div class="sample">
    <span class="sample-note">${_("info")}<span>${o(t.hass,e)}</span></span>
    <div class="sample-body" inert>${n}</div>
  </div>`}function H(t,e="info"){return c`<div class="note ${e}">${_(e==="info"?"info":"warning")}<span>${t}</span></div>`}function we(t,e=p){return c`<div class="callout">${_("info")}<span>${t}</span>${e}</div>`}var P=(t,e="info",n)=>c`<p class="dlg-note ${e}" id=${n??p}>${_(e)}<span>${t}</span></p>`,rt=(t,e)=>c`<div class=${t}><div class="sent" role="status">${_("check")}<span>${e}</span></div></div>`;function at(t){return x({label:o(t.hass,"resume"),iconName:"play",kind:"primary",disabled:t.changing,pending:t.isPending("resume"),onClick:()=>t.run("resume","button","press",{entity_id:t.refs.resume})})}function ot(t){let{hass:e,refs:n}=t,i=n.dual?["nozzle_left","nozzle_right"]:["nozzle"];return[...n.nozzles.map((r,a)=>({label:o(e,i[a]),heater:r,kind:"nozzle",index:a})),{label:o(e,"bed"),heater:n.bed,kind:"bed",index:0},{label:o(e,"chamber"),heater:n.chamber,kind:"chamber",index:0}]}function st(t){let{lower:e,raise:n,value:i,labelledBy:r}=t;return c`<div class="stepper" role=${r?"group":p} aria-labelledby=${r??p}>
    ${x({...e,iconName:"minus",iconOnly:!0})}
    <output class="step-value" aria-live="polite">${i}</output>
    ${x({...n,iconName:"plus",iconOnly:!0})}
  </div>`}function He(t){return t.refs.nozzles.flatMap(({sensor:e},n)=>{let i=k(t.hass,e);return e&&i!==void 0?[{sensor:e,value:i,index:n}]:[]}).sort((e,n)=>n.value-e.value)[0]}function le(t){let{hass:e,refs:n}=t;return!t.canControl||!t.online||w(e,n.developerMode)?.state!=="off"?p:H(o(e,"developer_off"),"warning")}function lt(t,e,n){let i=t.hass.entities[e]?.name;if(!i||Object.values(ue).some(s=>s[n]===i))return o(t.hass,n);let r=`${t.refs.name} `;return(i.startsWith(r)?i.slice(r.length).trim():"")||i}var Jt=["left","right"],ye=(t,e)=>o(t,e===0?"left":"right"),se="AMS HT";function dt(t,e){if(!e.model||e.name===e.model)return;let n=new Set(t.filter(i=>i.model&&i.model!==se).map(i=>i.model));return!e.name.includes(e.model)||n.size>1&&e.model!==se?e.model:void 0}function ct(t,e){let n=w(t,e.slots[0])?.attributes.nozzle;return n==="left"||n==="right"?n:void 0}function de(t){let e=Jt.indexOf(w(t.hass,t.refs.activeNozzle)?.state??"");return t.refs.dual&&e>=0?e:void 0}var Ca=new Set(["idle","unknown","unavailable",""]);function pt(t){let{hass:e,refs:n}=t,i=w(e,n.amsStatus)?.state;if(!(!t.online||i===void 0||Ca.has(i)))return o(e,"ams_activity",{state:D(e,n.amsStatus)})}function Sa(t,e,n){let i=w(t,e)?.attributes.slot;return typeof i=="number"&&Number.isInteger(i)&&i>0?i:n+1}var ut=(t,e,n,i)=>o(t,"slot_label",{slot:Sa(t,n,i),unit:e.name});function B(t,e){let n=w(t,e),i=!z(t,e),r=i?{}:n.attributes,a=l=>typeof l=="string"?l:"",s=r.remaining,d=!i&&(r.empty===!0||n?.state==="empty");return{entityId:e,name:d||i?"":a(r.name)||(n?.state??""),type:a(r.type),color:gi(r.color),...typeof s=="number"&&s>=0?{remaining:s}:{},active:r.active===!0,empty:d,unknown:i,rfid:r.rfid===!0,present:r.present===!0}}function Ee(t,e="small"){let n=t.color??"var(--bb-muted)",i=t.remaining??100,r=t.color!==void 0&&Qe(t.color),a=!t.empty&&i<100;return c`<span
    class="swatch ${e} ${t.empty?"empty":""} ${t.unknown?"unknown":""} ${t.active?"active":""} ${r?"outline":""} ${a?"partial":""}"
    style="--c: ${n}; --fill: ${Math.max(6,Math.min(100,i))}%"
    aria-hidden="true"
    ><span class="fill"></span
  ></span>`}var Qt=(t,e)=>o(t,e.present?"not_set":"empty");function ht(t,e){if(e.unknown)return o(t,"unknown");if(e.empty)return Qt(t,e);let n=e.remaining===void 0?"":` \xB7 ${M(t,e.remaining)}`;return`${e.name||e.type}${n}`}function Ta(t,e){return e==="ai_monitoring"&&/^X1/i.test(t.refs.model)?o(t.hass,"detection_ai_monitoring_x1"):void 0}function Aa(t,e,n){let{hass:i}=t,r=lt(t,n,`detection_${e}`),a=Ta(t,e),s=`det-sub-${e}`,d=c`<span class="det-text">
    <span class="det-name">${r}</span>
    ${a?c`<span class="det-sub" id=${s}>${a}</span>`:p}
  </span>`;if(!z(i,n))return c`<div class="det-row unknown">${d}<span class="det-state">${o(i,"unknown")}</span></div>`;let l=t.switchOn(n);if(t.viewOnly)return c`<div class="det-row">${d}<span class="det-state">${o(i,l?"on":"off")}</span></div>`;let u=t.isPending(`switch_${n}`);return c`<div class="det-row">
    ${d}
    <button
      class="det-switch"
      role="switch"
      aria-label=${r}
      aria-describedby=${a?s:p}
      aria-checked=${l?"true":"false"}
      aria-busy=${u?"true":"false"}
      aria-disabled=${u?"true":p}
      ?disabled=${!t.online}
      @click=${()=>t.toggleSwitch(n)}
    >
      <span class="toggle" aria-hidden="true"><span class="knob"></span></span>
    </button>
  </div>`}function wi(t){let{hass:e,refs:n}=t;if(!n.detectors.length)return p;let i=n.detectors.filter(({entityId:d})=>z(e,d)),r=i.filter(({entityId:d})=>!t.switchOn(d)).length,a=i.length===1?o(e,r?"off":"on"):r===0?o(e,"detection_all_on"):r===i.length?o(e,"detection_all_off"):o(e,"detection_off",{off:r}),s=t.optionsOpen;return c`<section class="detection">
    <button class="det-head" aria-expanded=${s?"true":"false"} aria-controls=${s?"det-body":p} @click=${()=>t.toggleOptions()}>
      <span class="section-label" id="det-title">${_("eye")}${o(e,"detection")}</span>
      ${i.length?c`<span class="det-summary">${a}</span>`:p}
      <span class="det-chevron ${s?"open":""}" aria-hidden="true">${_("chevronDown")}</span>
    </button>
    ${s?c`<div class="det-body" id="det-body" role="region" aria-labelledby="det-title">
          <div class="det-rows">${n.detectors.map(({key:d,entityId:l})=>Aa(t,d,l))}</div>
          <p class="hint">${o(e,"detection_hint")}</p>
        </div>`:p}
  </section>`}var ve=5,en={nozzle:220,bed:55,chamber:40},za={nozzle:320,bed:140,chamber:65};function Da(t){let e=de(t);return ot(t).flatMap(({label:n,heater:i,kind:r,index:a})=>i.target?[{label:n,kind:r,target:i.target,active:r==="nozzle"&&a===e,...i.sensor?{sensor:i.sensor}:{}}]:[])}var La=t=>Math.round(t/ve)*ve;function Ha(t,e){if(t.refs.nozzles.length>1&&!e.active)return en.nozzle;let n=w(t.hass,t.refs.activeFilament)?.attributes??{},i=n.nozzle_temp_min,r=n.nozzle_temp_max;return typeof i=="number"&&typeof r=="number"&&r>=i&&i>0?La((i+r)/2):en.nozzle}function xi(t,e){let{hass:n}=t,i=k(n,e.sensor);return c`<div class="heat-name">
    <span class="heat-label"
      >${_(e.kind)}<span class="heat-title"
        ><span class="heat-text">${e.label}</span> ${e.active?c`<span class="heat-tag">${o(n,"nozzle_active")}</span>`:p}</span
      ></span
    >
    <span class="heat-now"
      >${i===void 0?"\u2014":o(n,"heat_now",{value:N(n,e.sensor,i)})}</span
    >
  </div>`}function ki(t,e,n,i=!1){let{hass:r}=t,a=n===void 0||n<=oe(r,e.target),s=n===void 0?"\u2014":a?o(r,"heater_off"):N(r,e.target,n),d=c`<span class="sr-only">${o(r,"heat_target_said",{what:e.label})} </span>`;return i?c`<output class="heat-target ${a?"off":""}" aria-live="polite">${d}${s}</output>`:c`<span class="heat-target ${a?"off":""}">${d}${s}</span>`}function Ea(t,e){return c`<div class="heat-row view">${xi(t,e)} ${ki(t,e,k(t.hass,e.target))}</div>`}function Ra(t,e,n){let{hass:i}=t,r=t.targetOf(e.target),a=O(i,e.target),s=oe(i,e.target),d=w(i,e.target)?.attributes.max,l=typeof d=="number"?d:j(za[e.kind],a),u=r===void 0||r<=s,f=Math.min(l,j(e.kind==="nozzle"?Ha(t,e):en[e.kind],a)),m=u?f:Math.min(l,r+ve),g=u?s:Math.max(s,r-ve),h=e.label;return c`<div class="heat-row">
    ${xi(t,e)}
    <div class="heat-set">
      ${x({label:o(i,"heat_lower",{what:h,step:ve,unit:a}),iconName:"minus",iconOnly:!0,disabled:n.disabled||u,onClick:()=>t.stepTarget(e.target,g)})}
      ${ki(t,e,r,!0)}
      ${x({label:u?o(i,"heat_start",{what:h,value:L(i,f,a)}):o(i,"heat_raise",{what:h,step:ve,unit:a}),iconName:"plus",iconOnly:!0,disabled:n.disabled||!u&&r>=l,onClick:()=>t.stepTarget(e.target,m)})}
    </div>
    ${n.offered?x({label:o(i,"heat_off",{what:h}),iconName:"power",iconOnly:!0,kind:"plain",className:"heat-off",disabled:n.disabled||u||t.changing,onClick:()=>t.setTargets([[e.target,s]])}):p}
  </div>`}var yi=["cooling","heating"],vi={cooling:"airduct_cooling",heating:"airduct_heating",laser:"airduct_laser"};function Ma(t){let{hass:e,refs:n}=t,i=w(e,n.airduct);if(!i)return p;if(t.viewOnly)return c`<div class="airduct">
      <div class="nozzle-row">
        <span class="step-label">${o(e,"airduct")}</span>
        <span class="det-state">${o(e,vi[i.state]??"unknown")}</span>
      </div>
      <p class="hint">${o(e,"airduct_hint")}</p>
    </div>`;let r=ge(i,yi,!1).filter(u=>yi.includes(u)),a=X(r,i.state),s=t.isPending("airduct"),d=t.busy?"airduct_busy":t.changing?"changing_reason":void 0,l=o(e,"airduct");return c`<div class="airduct">
    <div class="nozzle-row">
      <span class="step-label">${l}</span>
      <div class="seg" role="radiogroup" aria-label=${l} @keydown=${W} @focusout=${Z}>
        ${r.map((u,f)=>c`<button
            role="radio"
            aria-checked=${u===i.state?"true":"false"}
            tabindex=${f===a?0:-1}
            aria-disabled=${s?"true":p}
            ?disabled=${!t.online||d!==void 0||i.state==="unavailable"}
            @click=${()=>t.run("airduct","select","select_option",{entity_id:n.airduct,option:u})}
          >
            ${o(e,vi[u])}
          </button>`)}
      </div>
    </div>
    ${i.state==="laser"?H(o(e,"airduct_laser_now")):p}
    ${d?H(o(e,d)):p}
    <p class="hint">${o(e,"airduct_hint")}</p>
  </div>`}function $i(t){let{hass:e}=t,n=Da(t);if(!n.length)return p;let i=!t.online,r=!t.busy&&!t.viewOnly,a=d=>r||d.kind==="chamber"&&!t.viewOnly,s=n.filter(d=>(t.targetOf(d.target)??0)>oe(e,d.target));return c`<section class="heating" aria-labelledby="heat-title">
    <div class="heat-head">
      <span class="section-label" id="heat-title">${_("heat")}${o(e,"heating")}</span>
      ${r?x({label:o(e,"cool_down"),iconName:"snow",kind:"plain",disabled:i||!s.length||t.changing,onClick:()=>t.setTargets(s.map(d=>[d.target,oe(e,d.target)]))}):p}
    </div>
    <div class="heat-rows">${n.map(d=>t.viewOnly?Ea(t,d):Ra(t,d,{disabled:i,offered:a(d)}))}</div>
    ${Ma(t)}
  </section>`}var Pa=[.1,1,10],tn=10,Oa=170,Ba=/^A(1|2L)\b/i,Na=["cold_nozzle_left","cold_nozzle_right"],Fa=["cold_nozzle_left_plain","cold_nozzle_right_plain"];function Va(t,e){let{hass:n,refs:i}=t,r=w(n,i.activeNozzle);if(!r)return p;let a=ge(r,Jt,!1),s=t.isPending("active_nozzle"),d=X(a,r.state);return c`<div class="nozzle-row">
    <span class="step-label">${o(n,"active_nozzle")}</span>
    <div class="seg" role="radiogroup" aria-label=${o(n,"active_nozzle")} @keydown=${W} @focusout=${Z}>
      ${a.map((l,u)=>c`<button
          role="radio"
          aria-checked=${l===r.state?"true":"false"}
          tabindex=${u===d?0:-1}
          aria-disabled=${s?"true":p}
          ?disabled=${e||r.state==="unavailable"}
          @click=${()=>t.run("active_nozzle","select","select_option",{entity_id:i.activeNozzle,option:l})}
        >
          ${D(n,i.activeNozzle,l)}
        </button>`)}
    </div>
  </div>`}function Ia(t){let e=de(t);return e!==void 0?t.refs.nozzles[e].sensor:He(t)?.sensor}function Ka(t,e,n){let{hass:i,refs:r}=t,a=!t.online||t.busy||t.changing,s=r.deviceId,d=C=>`${C>0?"+":"\u2212"}${A(i,Math.abs(C),1)}`,l=(C,ra,aa,oa)=>{let Bn=ra*e,Nn=`move_${C}`;return x({label:o(i,"move",{axis:C.toUpperCase(),distance:d(Bn)}),iconName:aa,iconOnly:!0,disabled:a,pending:t.isPending(Nn),className:`jog ${oa}`,onClick:()=>t.run(Nn,"bambuddy","move_axis",{device_id:s,axis:C,distance:Bn})})},u=Ba.test(r.model),f=C=>x({label:o(i,C>0?"bed_away":"bed_closer"),aria:u?o(i,C>0?"nozzle_away_aria":"nozzle_closer_aria",{step:A(i,e,1)}):o(i,C>0?"bed_away_aria":"bed_closer_aria",{step:A(i,e,1)}),iconName:C>0===u?"up":"down",disabled:a,pending:t.isPending("move_z"),className:"stack",onClick:()=>t.run("move_z","bambuddy","move_axis",{device_id:s,axis:"z",distance:C*e})}),m=Ia(t),g=k(i,m),h=O(i,m),b=j(Oa,h),y=g!==void 0&&g<b,$=de(t),v=t.settings.sections.includes("heating"),F=$===void 0?v?"cold_nozzle":"cold_nozzle_plain":(v?Na:Fa)[$],ee=C=>x({label:o(i,C>0?"extrude":"retract"),aria:o(i,C>0?"extrude_aria":"retract_aria",{length:tn}),iconName:C>0?"down":"up",disabled:a||y,pending:t.isPending("extrude"),className:"stack",onClick:()=>t.run("extrude","bambuddy","extrude",{device_id:s,distance:C*tn})}),T=x({label:o(i,"home"),aria:o(i,"home_aria"),iconName:"home",iconOnly:!0,kind:a?"tonal":"primary",disabled:a,pending:t.isPending("home"),className:"jog home",onClick:()=>t.confirm({title:o(i,"home_title"),text:o(i,"home_text"),confirm:o(i,"home"),action:["bambuddy","home_axes",{device_id:s}],key:"home"})});return c`${t.online&&t.busy?H(o(i,"busy_reason"),"warning"):t.changing?H(o(i,"changing_reason")):p}
    ${Va(t,a)}
    <div class="control">
      <div class="step-row">
        <span class="step-label">${o(i,"step")}</span>
        <div class="seg" role="radiogroup" aria-label=${o(i,"step")} @keydown=${W} @focusout=${Z}>
          ${Pa.map(C=>c`<button
              role="radio"
              aria-checked=${C===e?"true":"false"}
              tabindex=${C===e?0:-1}
              @click=${()=>n(C)}
            >
              ${A(i,C,1)} mm
            </button>`)}
        </div>
        ${t.startLive?x({label:o(i,"live"),iconName:"video",iconOnly:!0,className:"live-btn",onClick:t.startLive}):p}
      </div>
      <div class="pad">
        ${l("y",1,"up","n")}${l("x",-1,"left","w")}${T}${l("x",1,"right","e")}${l("y",-1,"down","s")}
      </div>
      <div class="axis-col bed">
        <span class="axis-label">${o(i,u?"nozzle_height":"bed_axis")}</span>
        ${u?c`${f(1)}${f(-1)}`:c`${f(-1)}${f(1)}`}
      </div>
      <div class="axis-col ext">
        <span class="axis-label">${o(i,"extruder")} · ${A(i,tn)} mm</span>
        <div class="ext-buttons">${ee(-1)}${ee(1)}</div>
      </div>
    </div>
    ${y&&!a?H(o(i,F,{temperature:L(i,b,h)})):p}
    <p class="hint">${o(i,"jog_note")}</p>`}function Ci(t,e,n=!1){return e==="heating"?[...t.nozzles,t.bed,t.chamber].some(i=>i.target!==void 0):e==="motion"?!n:t.detectors.length>0}function nn(t,e,n){let i=r=>r==="heating"?$i(t):r==="options"?wi(t):t.viewOnly?p:Ka(t,e,n);return c`${le(t)}${t.settings.sections.map(i)}`}var Ua=["pass","fail","warn","skip"];async function Ti(t,e){let n=await qe(t,"run_diagnostic",{device_id:e}),i=Ye(n.checks,"id","string").map(r=>({id:r.id,status:Ua.includes(r.status)?r.status:"skip",params:typeof r.params=="object"&&r.params!==null?r.params:{}}));return{overall:typeof n.overall=="string"?n.overall:"ok",checks:i}}function mt(t,e,n={}){return e in ue[he(t)]?o(t,e,n):void 0}var rn=t=>Object.fromEntries(Object.entries(t.params).filter(e=>["string","number"].includes(typeof e[1]))),Ai=(t,e)=>mt(t,`check_${e.id}`,rn(e))??e.id;function zi(t,e,n=!1){let i=typeof e.params.reason=="string"?e.params.reason:void 0;if(e.id==="developer_mode"&&e.status==="fail")return o(t,"developer_off");let r=i?`check_${e.id}_${e.status}_${i}`:void 0,a=r&&mt(t,r)!==void 0?r:`check_${e.id}_${e.status}`,s=mt(t,a,rn(e)),d=n?mt(t,`${a}_fix`,rn(e)):void 0;return s?[s,d].filter(Boolean).join(" "):e.status==="skip"?o(t,"check_skip"):void 0}var ja={pass:"check",fail:"error",warn:"warning",skip:"minus"},Ga={pass:"ok",fail:"error",warn:"warning",skip:"skip"};function Wa(t,e,n){let{hass:i}=t,r=zi(i,e,!n),a=e.status==="fail"?"hms_error":e.status==="warn"?"hms_warning":void 0;return c`<div class="check-item hms-item sev-${Ga[e.status]}">
    ${_(ja[e.status])}
    <div class="hms-body">
      ${a?c`<span class="sr-only">${o(i,a)}: </span>`:p}<span class="check-title">${Ai(i,e)}</span>
      ${r?c`<span class="check-detail">${r}</span>`:p}
      ${n?c`<span class="check-detail">${o(i,"check_follows")}</span>`:p}
    </div>
  </div>`}function Za(t,e){let n=e.checks.filter(r=>r.status==="fail").length,i=e.checks.filter(r=>r.status==="warn").length;if(e.overall==="problems"||n>0){let r=Math.max(1,n);return{tone:"err",text:r===1?o(t,"check_problems_one"):o(t,"check_problems",{n:r})}}if(e.overall==="warnings"||i>0){let r=Math.max(1,i);return{tone:"warn",text:r===1?o(t,"check_warnings_one"):o(t,"check_warnings",{n:r})}}return{tone:"ok",text:o(t,"check_ok")}}function Si(t,e,n,i,r){let{hass:a}=t;if(!n.length)return p;let s=i.open?.includes(e)??!1,d=n.length,l=e==="pass"?d===1?o(a,"check_passed_one"):o(a,"check_passed",{n:d}):o(a,"check_skipped",{n:d});return c`<div class="check-fold ${e==="pass"?"tone-ok":"tone-neutral"}">
    <button class="det-head" aria-expanded=${s?"true":"false"} @click=${()=>r.toggleFold(e)}>
      <span class="section-label">${_(e==="pass"?"check":"minus")}${l}</span>
      <span class="det-chevron ${s?"open":""}" aria-hidden="true">${_("chevronDown")}</span>
    </button>
    ${s?c`<div class="check-folded">
          ${n.map(u=>c`<div class="check-line">
              <span class="check-title">${Ai(a,u)}</span>
              ${e==="skip"?c`<span class="check-detail">${zi(a,u)}</span>`:p}
            </div>`)}
        </div>`:p}
  </div>`}function qa(t,e,n){let{hass:i}=t;if(e.running){let a=Math.max(0,Math.floor((n-e.started)/1e3));return c`<div class="check-running">
        <span class="check-spinner" aria-hidden="true"></span>
        <span class="check-seconds" aria-hidden="true">${o(i,"check_running",{s:a})}</span>
        <span class="sr-only">${o(i,"check_running_sr")}</span>
      </div>
      <p class="hint">${o(i,"check_running_hint")}</p>`}if(e.error||!e.result)return c`<div class="dlg-error">${_("error")}<span>${o(i,"check_error",{error:e.error??""})}</span></div>`;let r=Za(i,e.result);return c`<div class="check-verdict tone-${r.tone}">${_(r.tone==="ok"?"check":r.tone==="warn"?"warning":"error")}<span>${r.text}</span></div>`}function Di(t,e,n,i){let{hass:r}=t,a=!e.running&&e.result?e.result.checks:[],s=a.some(l=>l.id==="port_mqtt"&&l.status==="fail"),d=a.filter(l=>l.status==="fail"||l.status==="warn").sort((l,u)=>+(u.status==="fail")-+(l.status==="fail"));return c`<h2 id="dlg-title">${o(r,"check_connection")}</h2>
    <div class="check-status" role="status">${qa(t,e,i)}</div>
    ${d.length?c`<div class="hms-list check-list">
          ${d.map(l=>Wa(t,l,s&&l.id!=="port_mqtt"&&l.id.startsWith("port_")))}
        </div>`:p}
    ${Si(t,"pass",a.filter(l=>l.status==="pass"),e,n)}
    ${Si(t,"skip",a.filter(l=>l.status==="skip"),e,n)}`}var an=["tap","always","off"],ft=["controls","power","temperatures","ams","fans","speed"],on=["network","hms","firmware","maintenance","door","storage","drying","power"],Li=["network","hms","firmware"],gt=["heating","options","motion"],sn=["status","control","filament"],ln=["auto","folded","open"],Hi=["ai_monitoring","first_layer_inspection","build_plate_detection","build_plate_position_detection","spaghetti_detection","pileup_detection","clumping_detection","air_printing_detection"];var dn="bambuddy",Pi=t=>t.slice(0,t.indexOf(".")),Ei=new WeakMap;function Re(t){let e=Ei.get(t.entities);if(e)return e;let n=new Map;for(let i of Object.values(t.entities)){if(!i||i.platform!==dn||!i.device_id)continue;let r=n.get(i.device_id)??[];r.push(i),n.set(i.device_id,r)}return Ei.set(t.entities,n),n}function cn(t){let e=new Map;for(let n of t){if(!n.translation_key)continue;let i=`${Pi(n.entity_id)}.${n.translation_key}`;e.set(i,[...e.get(i)??[],n.entity_id])}return e}var Ya="sensor.print_status";function Oi(t,e){return(Re(t).get(e)??[]).find(n=>n.translation_key==="print_status"&&Pi(n.entity_id)==="sensor")?.entity_id}var _t=(t,e)=>!!e&&Oi(t,e)!==void 0;function Bi(t,e){let n=Oi(t,e);return n?t.states[n]?.state:void 0}function Ni(t){return Object.values(t.devices).filter(e=>!!e&&_t(t,e.id))}var Me=t=>t.name_by_user||t.name||"";function Ri(t){let e=t?t.lastIndexOf(" ("):-1;return e>0?t.slice(0,e):void 0}function Fi(t,e){let n=Me(t);if(t.name_by_user)return n;let i=[e.name,e.name_by_user,Ri(e.name)].find(a=>a&&n.startsWith(`${a} `)),r=i?n.slice(i.length+1):n;return r.endsWith(")")?Ri(r)??r:r}function Vi(t,e,n){let i=t.states[e]?.attributes[n];return typeof i=="number"?i:void 0}function Xa(t,e){let n=i=>Vi(t,i,"slot")??Number.MAX_SAFE_INTEGER;return[...e].sort((i,r)=>n(i)-n(r))}function Mi(t,e){let n=e.slots.map(i=>Vi(t,i,"tray_id")).filter(i=>i!==void 0);return n.length?Math.min(...n):Number.MAX_SAFE_INTEGER}function Ja(t,e){let n=Re(t),i=[];for(let r of Object.values(t.devices)){if(!r||r.via_device_id!==e.id)continue;let a=cn(n.get(r.id)??[]),s=a.get("sensor.ams_slot");if(!s)continue;let d=l=>a.get(l)?.[0];i.push({deviceId:r.id,name:Fi(r,e),model:r.model??"",humidity:d("sensor.ams_humidity"),temperature:d("sensor.ams_temperature"),slots:Xa(t,s),drying:d("binary_sensor.drying"),dryingRemaining:d("sensor.drying_remaining_time")})}return i.sort((r,a)=>Mi(t,r)-Mi(t,a)||r.name.localeCompare(a.name))}function q(t,e,n){let i=e.power??e.run;return i?t.states[i]?.attributes[n]:void 0}function Qa(t,e){let n=Re(t),i=[];for(let r of Object.values(t.devices)){if(!r||r.via_device_id!==e.id)continue;let a=cn(n.get(r.id)??[]),s=f=>a.get(f)?.[0],d=s("switch.plug"),l=d??s("binary_sensor.plug"),u=s("button.plug_run");!l&&!u||i.push({deviceId:r.id,name:Fi(r,e),...l?{power:l}:{},switchable:d!==void 0,...u?{run:u}:{},...s("sensor.plug_power")?{watts:s("sensor.plug_power")}:{},...s("sensor.plug_energy_today")?{energyToday:s("sensor.plug_energy_today")}:{},...s("switch.auto_off")?{autoOff:s("switch.auto_off")}:{},...s("switch.auto_off_every_print")?{autoOffEveryPrint:s("switch.auto_off_every_print")}:{},...s("number.auto_off_temperature")?{autoOffTemperature:s("number.auto_off_temperature")}:{},...s("button.auto_off_skip")?{autoOffSkip:s("button.auto_off_skip")}:{}})}return i.sort((r,a)=>r.name.localeCompare(a.name))}var eo={"fan.part_cooling_fan":"part","fan.auxiliary_fan":"aux","fan.chamber_fan":"chamber","fan.exhaust_fan":"exhaust","fan.left_auxiliary_fan":"left_aux"},to=[...["left_","right_"].flatMap(t=>[`sensor.${t}nozzle_temperature`,`number.${t}nozzle_target_temperature`,`sensor.${t}external_spool`]),"select.active_nozzle"];function Ii(t,e){let n=e?t.devices[e]:void 0;if(!n)return;let i=Re(t).get(n.id)??[],r=cn(i),a=v=>r.get(v)?.[0],s=a(Ya);if(!s)return;let d=to.some(v=>r.has(v)),l=d?["left_","right_"]:[""],u=l.map(v=>({sensor:a(`sensor.${v}nozzle_temperature`),target:a(`number.${v}nozzle_target_temperature`)})),f=l.map(v=>a(`sensor.${v}external_spool`)),m=Object.entries(eo).map(([v,F])=>({key:F,entityId:a(v)})).filter(v=>v.entityId!==void 0),g=Hi.map(v=>({key:v,entityId:a(`switch.${v}`)})).filter(v=>v.entityId!==void 0),h=a("binary_sensor.online"),b=Ja(t,n),y=Qa(t,n),$=v=>l.map(F=>a(`sensor.${F}${v}`));return{deviceId:n.id,name:Me(n),model:n.model??"",status:s,stage:a("sensor.print_stage"),progress:a("sensor.progress"),remaining:a("sensor.remaining_time"),endTime:a("sensor.end_time"),layer:a("sensor.current_layer"),totalLayers:a("sensor.total_layers"),job:a("sensor.current_print"),nozzles:u,dual:d,bed:{sensor:a("sensor.bed_temperature"),target:a("number.bed_target_temperature")},chamber:{sensor:a("sensor.chamber_temperature"),target:a("number.chamber_target_temperature")},hotendFan:a("sensor.hotend_fan"),hms:a("sensor.hms_errors"),activeFilament:a("sensor.active_filament"),externalSpools:f.filter(v=>v!==void 0),online:h,plateClearNeeded:a("binary_sensor.plate_clear_needed"),developerMode:a("binary_sensor.developer_mode"),amsStatus:a("sensor.ams_status"),activeNozzle:a("select.active_nozzle"),pause:a("button.pause"),resume:a("button.resume"),stop:a("button.stop"),plateCleared:a("button.plate_cleared"),clearHms:a("button.clear_hms_errors"),speed:a("select.print_speed"),fans:m,detectors:g,light:a("light.chamber_light")??a("light.light"),plainLight:!a("light.chamber_light")&&a("light.light")!==void 0,camera:a("camera.camera"),cameraFps:a("number.camera_frame_rate"),cover:a("image.cover"),refresh:a("button.refresh_status"),printHours:a("sensor.print_hours"),wifiSignal:a("sensor.wifi_signal"),wiredNetwork:a("binary_sensor.wired_network"),ipAddress:a("sensor.ip_address"),firmware:a("update.firmware"),door:a("binary_sensor.door"),storage:a("binary_sensor.sd_card")??a("binary_sensor.usb_drive"),storageUsb:!r.has("binary_sensor.sd_card")&&r.has("binary_sensor.usb_drive"),maintenance:a("sensor.maintenance"),airduct:a("select.airduct_mode"),filamentBackup:a("switch.ams_filament_backup"),nozzleDiameters:$("nozzle_diameter"),nozzleTypes:$("nozzle_type"),ams:b,plugs:y,watched:[...i.map(v=>v.entity_id),...[...b,...y].flatMap(v=>(Re(t).get(v.deviceId)??[]).map(F=>F.entity_id))]}}function Ki(t){let e=[...t.nozzles,t.bed,t.chamber].map(i=>i.target);return[t.pause,t.resume,t.stop,t.plateCleared,t.clearHms,t.light,t.speed,t.activeNozzle,t.airduct,t.filamentBackup,...e].some(i=>i!==void 0)||t.fans.length>0||t.detectors.length>0}function pn(t,e){if(e.online)return t.states[e.online]?.state==="on";let n=e.status?t.states[e.status]?.state:void 0;return n!==void 0&&n!=="offline"&&n!=="unavailable"}function Ui(t,e){return pn(t,e)?e.ams.filter(n=>n.slots.some(i=>t.states[i]?.state!=="unavailable")):e.ams}var ji={ATTRIBUTE:1,CHILD:2,PROPERTY:3,BOOLEAN_ATTRIBUTE:4,EVENT:5,ELEMENT:6},Gi=t=>(...e)=>({_$litDirective$:t,values:e}),bt=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,n,i){this._$Ct=e,this._$AM=n,this._$Ci=i}_$AS(e,n){return this.update(e,n)}update(e,n){return this.render(...n)}};var{I:no}=ii,Wi=t=>t;var Zi=()=>document.createComment(""),xe=(t,e,n)=>{let i=t._$AA.parentNode,r=e===void 0?t._$AB:e._$AA;if(n===void 0){let a=i.insertBefore(Zi(),r),s=i.insertBefore(Zi(),r);n=new no(a,s,t,t.options)}else{let a=n._$AB.nextSibling,s=n._$AM,d=s!==t;if(d){let l;n._$AQ?.(t),n._$AM=t,n._$AP!==void 0&&(l=t._$AU)!==s._$AU&&n._$AP(l)}if(a!==r||d){let l=n._$AA;for(;l!==a;){let u=Wi(l).nextSibling;Wi(i).insertBefore(l,r),l=u}}}return n},J=(t,e,n=t)=>(t._$AI(e,n),t),io={},qi=(t,e=io)=>t._$AH=e,Yi=t=>t._$AH,wt=t=>{t._$AR(),t._$AA.remove()};var Xi=(t,e,n)=>{let i=new Map;for(let r=e;r<=n;r++)i.set(t[r],r);return i},Ji=Gi(class extends bt{constructor(t){if(super(t),t.type!==ji.CHILD)throw Error("repeat() can only be used in text expressions")}dt(t,e,n){let i;n===void 0?n=e:e!==void 0&&(i=e);let r=[],a=[],s=0;for(let d of t)r[s]=i?i(d,s):s,a[s]=n(d,s),s++;return{values:a,keys:r}}render(t,e,n){return this.dt(t,e,n).values}update(t,[e,n,i]){let r=Yi(t),{values:a,keys:s}=this.dt(e,n,i);if(!Array.isArray(r))return this.ut=s,a;let d=this.ut??=[],l=[],u,f,m=0,g=r.length-1,h=0,b=a.length-1;for(;m<=g&&h<=b;)if(r[m]===null)m++;else if(r[g]===null)g--;else if(d[m]===s[h])l[h]=J(r[m],a[h]),m++,h++;else if(d[g]===s[b])l[b]=J(r[g],a[b]),g--,b--;else if(d[m]===s[b])l[b]=J(r[m],a[b]),xe(t,l[b+1],r[m]),m++,b--;else if(d[g]===s[h])l[h]=J(r[g],a[h]),xe(t,r[m],r[g]),g--,h++;else if(u===void 0&&(u=Xi(s,h,b),f=Xi(d,m,g)),u.has(d[m]))if(u.has(d[g])){let y=f.get(s[h]),$=y!==void 0?r[y]:null;if($===null){let v=xe(t,r[m]);J(v,a[h]),l[h]=v}else l[h]=J($,a[h]),xe(t,r[m],$),r[y]=null;h++}else wt(r[g]),g--;else wt(r[m]),m++;for(;h<=b;){let y=xe(t,l[b+1]);J(y,a[h]),l[h++]=y}for(;m<=g;){let y=r[m++];y!==null&&wt(y)}return this.ut=s,qi(t,l),U}});var Qi={"Clean Build Plate":"maint_task_clean_build_plate","Clean Nozzle/Hotend":"maint_task_clean_nozzle","Check Belt Tension":"maint_task_belt_tension","Check PTFE Tube":"maint_task_ptfe_tube","Clean Carbon Rods":"maint_task_clean_carbon_rods","Lubricate Steel Rods":"maint_task_lubricate_steel_rods","Clean Steel Rods":"maint_task_clean_steel_rods","Lubricate Linear Rails":"maint_task_lubricate_rails","Clean Linear Rails":"maint_task_clean_rails"},er=t=>typeof t=="number"&&Number.isFinite(t)?t:0;function ro(t){if(typeof t!="object"||t===null)return;let e=t;if(typeof e.id!="number")return;let n=e.due===!0;return{id:e.id,name:typeof e.name=="string"?e.name:"",due:n,dueSoon:!n&&e.due_soon===!0,unit:e.unit==="days"?"days":"hours",interval:er(e.interval),left:er(e.left),done:typeof e.last_done=="string"}}function yt(t){let e=w(t.hass,t.refs.maintenance);if(!e||t.unreachable||!z(t.hass,t.refs.maintenance))return;let n=e.attributes.tasks,i=(Array.isArray(n)?n:[]).map(ro).filter(r=>r!==void 0);return{state:e.state,tasks:i,due:i.filter(r=>r.due).length,soon:i.filter(r=>r.dueSoon).length}}var ao=t=>t.due?"err":t.dueSoon?"warn":"ok";function tr(t,e){let{hass:n}=t,i=yt(t);if(!i)return p;let{due:r,soon:a}=i,s=r+a,d=r>0?"err":a>0?"warn":"ok",l=s?o(n,"maint_due_aria",{n:s,overdue:r,soon:a}):o(n,"maint_ok_aria");return c`<button class="pill maintenance tone-${d}" aria-label=${l} title=${l} aria-haspopup="dialog" @click=${e}>
    ${_("wrench")}<span>${s?o(n,"maint_due",{n:s}):o(n,"maint_ok")}</span>
  </button>`}function un(t,e,n){let{hass:i}=t,r=Math.abs(n);return e.unit==="days"?G(i,r*1440):r<24?G(i,r*60):o(i,"dur_h",{h:A(i,Math.round(r))})}function oo(t,e){let{hass:n}=t;return e.done?e.due?o(n,"maint_overdue",{time:un(t,e,e.left)}):e.dueSoon?o(n,"maint_soon",{time:un(t,e,e.left)}):o(n,"maint_in",{time:un(t,e,e.left)}):o(n,"maint_never")}function so(t){let e=i=>i.due?0:i.dueSoon?1:2,n=i=>i.left*(i.unit==="days"?24:1);return[...t].sort((i,r)=>e(i)-e(r)||n(i)-n(r))}function lo(t,e,n,i,r){let{hass:a}=t,s=Object.hasOwn(Qi,e.name)?Qi[e.name]:void 0,d=s?o(a,s):e.name,l=e.interval>0?Math.min(1,Math.max(0,(e.interval-e.left)/e.interval)):1,u=n.marking?.includes(e.id)??!1,f=n.confirming===e.id;return c`<div class="maint-row tone-${ao(e)}">
    <div class="maint-text">
      <span class="maint-name">${d}</span>
      <span class="maint-when">${oo(t,e)}</span>
      <span class="maint-bar" aria-hidden="true"><span style="width: ${Math.round(l*100)}%"></span></span>
    </div>
    ${r&&!f?c`<button
          class="btn ${e.due||e.dueSoon?"tonal":"plain"} maint-done ${u?"pending":""}"
          data-task=${e.id}
          aria-label=${o(a,"maint_done_aria",{task:d})}
          aria-busy=${u?"true":"false"}
          ?disabled=${u}
          @click=${()=>i.confirmTask(e.id)}
        >
          ${_("check")}<span>${o(a,"maint_done")}</span>
        </button>`:p}
    ${r&&f?c`<div class="maint-confirm" role="group" aria-label=${d} aria-describedby="maint-ask-${e.id}">
          <span id="maint-ask-${e.id}">${o(a,"maint_confirm")}</span>
          <span class="maint-confirm-actions">
            <button class="btn plain" @click=${()=>i.confirmTask(void 0)}>${o(a,"cancel")}</button>
            <button class="btn primary" @click=${()=>i.markDone(e.id,d)}>${o(a,"maint_done")}</button>
          </span>
        </div>`:p}
  </div>`}function nr(t,e,n){let{hass:i,refs:r}=t,a=yt(t),s=so(a?.tasks??[]),d=!t.settings.readOnly,l=w(i,r.printHours);return c`<h2 id="dlg-title">${o(i,"maint_title")}</h2>
    ${s.some(u=>!u.done)?P(o(i,d?"maint_all_never":"maint_all_never_hidden")):p}
    ${s.length?c`<div class="maint-list">${Ji(s,u=>u.id,u=>lo(t,u,e,n,d))}</div>`:t.unreachable?P(o(i,"unreachable_short")):c`<p class="hms-empty">${o(i,"maint_none")}</p>`}
    ${e.error?c`<div class="dlg-error" role="alert">${_("error")}<span>${e.error}</span></div>`:p}
    <p class="maint-said sr-only" role="status">${e.marked?o(i,"maint_marked",{task:e.marked}):""}</p>
    <p class="maint-foot">
      ${l&&z(i,r.printHours)?c`<span>${o(i,"maint_hours",{hours:D(i,r.printHours,l.state)??l.state})}</span>`:p}
      <span>${o(i,"maint_note")}</span>
    </p>`}var co=18e4,kt=50,vt=5,po=30,uo=100,ir=50,mn=(t,e)=>q(t.hass,e,"powers_printer")===!0,ho=(t,e)=>q(t.hass,e,"bambuddy_auto_off")===!0,mo=(t,e)=>q(t,e,"on_printer_card")!==!1,or=(t,e,n)=>e.some(r=>typeof q(t,r,"printer_main")=="boolean")?q(t,n,"printer_main")===!0:e.find(r=>q(t,r,"powers_printer")===!0)===n,fn=(t,e)=>{let n=r=>or(t,e,r),i=r=>Number(r.power!==void 0&&n(r));return e.filter(r=>n(r)||mo(t,r)).sort((r,a)=>i(a)-i(r))},xt=t=>fn(t.hass,t.refs.plugs),Oe=t=>xt(t).find(e=>e.power&&or(t.hass,t.refs.plugs,e)),Be=(t,e)=>w(t.hass,e.power??e.run)?.state??"unavailable",Pe=t=>!t.settings.readOnly,fo=["plug_off_hot_left","plug_off_hot_right"],rr={drying:"auto_off_waiting_drying",filament:"auto_off_waiting_filament",heating:"auto_off_waiting_heating",printer:"auto_off_waiting_printer",plug:"auto_off_waiting_plug"};function $t(t,e){let n=w(t.hass,e.autoOff);if(!n)return;let i=n.attributes,r=k(t.hass,e.autoOffTemperature),a=r===void 0?"\xB0C":O(t.hass,e.autoOffTemperature),s=r??(typeof i.temperature=="number"?i.temperature:kt);return{armed:n.state==="on",phase:typeof i.phase=="string"?i.phase:"idle",...typeof i.since=="string"?{since:i.since}:{},temperature:s,unit:a,every:i.every_print===!0,...typeof i.waiting_for=="string"?{waitingFor:i.waiting_for}:{},switching:i.switching===!0}}var ar=(t,e)=>!!e&&$t(t,e)?.phase==="waiting";function go(t,e){let{hass:n,refs:i}=t,r=e.power,a=["switch","turn_off",{entity_id:r}],s=`plug_${r}`,d=o(n,"plug_off_confirm"),l=o(n,"plug_off_keep");if(!mn(t,e))return{title:o(n,"plug_off_title",{plug:e.name}),text:o(n,"plug_off_text"),confirm:d,keep:l,action:a,key:s};if(t.online&&t.busy){let m=D(n,i.job),g=m?et(m):void 0,h=k(n,i.progress);return{title:o(n,"plug_off_title_print"),text:g&&h!==void 0?o(n,"plug_off_text_print",{job:g,progress:M(n,h)}):o(n,"plug_off_text_print_plain"),note:o(n,"plug_off_print_note"),noteTone:"warning",confirm:d,keep:l,danger:!0,action:a,key:s}}if(!t.online){let m=k(n,e.watts);return{title:o(n,"plug_off_title_printer"),text:m===void 0?o(n,"plug_off_text_offline_plain"):o(n,m>ir?"plug_off_text_offline":"plug_off_text_offline_idle",{power:_e(n,m)}),confirm:d,keep:l,danger:m===void 0||m>ir,action:a,key:s}}let u=He(t),f=u!==void 0&&u.value>=j(kt,O(n,u.sensor))?u:void 0;return{title:o(n,"plug_off_title_printer"),text:o(n,"plug_off_text_printer",{plug:e.name}),...f?{note:o(n,t.refs.nozzles.length>1?fo[f.index]:"plug_off_hot",{temperature:N(n,f.sensor,f.value)}),noteTone:"warning"}:{},confirm:d,keep:l,action:a,key:s}}function hn(t,e,n){n?t.toggleSwitch(e.power):t.confirm(go(t,e))}var sr=(t,e)=>t.isPending(`switch_${e}`)||t.isPending(`plug_${e}`);function lr(t,e,n,i){let r=t.switchOn(e),a=sr(t,e);return c`<button
    class="det-switch"
    role="switch"
    aria-label=${n}
    aria-checked=${r?"true":"false"}
    aria-busy=${a?"true":"false"}
    aria-disabled=${a?"true":p}
    @click=${a?p:i}
  >
    <span class="toggle" aria-hidden="true"><span class="knob"></span></span>
  </button>`}function _o(t,e,n){let{hass:i}=t,r=k(i,e.watts),a=k(i,e.energyToday),s=[c`${o(i,n==="on"?"on":n==="off"?"off":"unknown")}`];return r!==void 0&&s.push(c`<b>${_e(i,r)}</b>`),a!==void 0&&s.push(c`${o(i,"plug_today",{energy:hi(i,a)})}`),c`${s.map((d,l)=>l?c` · ${d}`:d)}`}function bo(t,e,n){let{hass:i}=t,r=Be(t,e),a=!e.power&&e.run!==void 0,s,d=p,l=p,u,f="";if(a){if(s=o(i,"plug_script"),Pe(t)&&r!=="unavailable"){let g=`run_${e.run}`;d=x({label:o(i,"plug_run"),aria:o(i,"plug_run_named",{plug:e.name}),iconName:"play",pending:t.isPending(g),onClick:()=>t.run(g,"button","press",{entity_id:e.run})})}}else if(r==="unavailable")s=o(i,t.unreachable?"unreachable_short":"plug_unreachable"),f=t.unreachable?"":"warn";else if(r==="unknown"&&e.switchable){if(s=o(i,"plug_unknown"),Pe(t)){let g=sr(t,e.power);l=c`<div class="p-set" role="group" aria-label=${e.name}>
        ${[!1,!0].map(h=>x({label:o(i,h?"plug_turn_on":"plug_turn_off"),aria:o(i,h?"plug_turn_on_named":"plug_turn_off_named",{plug:e.name}),iconName:h?"power":"plugOff",pending:g,onClick:()=>hn(t,e,h)}))}
      </div>`}}else s=_o(t,e,r),e.switchable&&Pe(t)?d=lr(t,e.power,e.name,()=>hn(t,e,!t.switchOn(e.power))):q(i,e,"plug_type")==="mqtt"&&(u=o(i,"plug_monitor"));let m=r==="on";return c`<div class="p-row ${f} ${a?"p-script":""}">
      <span class="p-icon ${m?"on":""}" aria-hidden="true">${_(a?"script":m||r==="unknown"?"plug":"plugOff")}</span>
      <span class="p-text">
        <span class="p-name">${e.name}${n?c` <span class="temp-tag">${o(i,"plug_printer_tag")}</span>`:p}</span>
        <span class="p-sub">${s}</span>
        ${u?c`<span class="p-sub">${u}</span>`:p}
      </span>
      ${d}
    </div>
    ${l}`}function wo(t,e){let{hass:n}=t;if(!t.settings.showAutoOff||!mn(t,e))return p;let i=$t(t,e),r=ho(t,e);if(!i&&!r)return p;if(Be(t,e)==="unavailable"&&!i?.armed)return p;let a=L(n,i?.temperature??kt,i?.unit),s=i?.phase==="waiting"&&!r,d=s?o(n,"auto_off_waiting_title"):o(n,"auto_off_title"),l;if(r)l=o(n,t.viewOnly||!i?"auto_off_bambuddy_view":"auto_off_bambuddy");else if(s){let h=He(t),b=i?.waitingFor;l=i?.switching?o(n,"auto_off_switching"):b&&b!=="nozzle"&&rr[b]?o(n,rr[b]):o(n,"auto_off_waiting",{temperature:a,now:h===void 0?"\u2014":N(n,h.sensor,h.value)})}else i?.phase==="failed_print"?l=o(n,i.every?"auto_off_failed":"auto_off_failed_next"):i?.phase==="gave_up"?l=o(n,"auto_off_gave_up"):i?.phase==="skipped"&&i.armed?l=o(n,"auto_off_skipped"):i?.armed?l=o(n,i.every?"auto_off_every":"auto_off_next",{temperature:a}):l=o(n,"auto_off_disarmed");let u=Pe(t)&&!r&&!!e.autoOff,f=c`<span class="p-name">${d}</span>
    <span class="p-sub">${l}</span>`,m=u?lr(t,e.autoOff,o(n,"auto_off_title"),()=>t.toggleSwitch(e.autoOff)):p,g=s&&u&&!i?.switching&&e.autoOffSkip&&w(n,e.autoOffSkip)?.state!=="unavailable"?x({label:o(n,"auto_off_skip"),iconName:"timerOff",pending:t.isPending(`skip_${e.autoOffSkip}`),onClick:()=>t.run(`skip_${e.autoOffSkip}`,"button","press",{entity_id:e.autoOffSkip})}):p;return c`<div class="p-row p-auto ${s?"waiting":""}">
      <span class="p-icon" aria-hidden="true">${_(i?.armed||r?"timer":"timerOff")}</span>
      ${u&&e.autoOffTemperature?c`<button class="p-text p-open" aria-label="${d}: ${l}" aria-haspopup="dialog" @click=${t.openAutoOff}>
            <span class="p-open-text">${f}</span><span class="p-chevron" aria-hidden="true">${_("chevronRight")}</span>
          </button>`:c`<span class="p-text">${f}</span>`}
      ${m}
    </div>
    ${g===p?p:c`<div class="p-skip">${g}</div>`}`}function dr(t,e=!1){let n=Oe(t),i=e?xt(t).filter(r=>r!==n):xt(t);return i.map(r=>c`${bo(t,r,i.length>1&&r===n)}${r===n?wo(t,r):p}`)}function cr(t){let e=dr(t,!t.online&&_n(t)!==void 0);return e.length?c`<section class="power" aria-labelledby="power-title">
    <div class="speed-label" id="power-title">${_("bolt")}<span>${o(t.hass,"power_title")}</span></div>
    <div class="power-box">${e}</div>
  </section>`:p}function pr(t){return c`<h2 id="dlg-title">${o(t.hass,"power_title")}</h2>
    <div class="power-box">${dr(t)}</div>`}function ur(t){let{hass:e}=t,n=Oe(t),i=n?$t(t,n):void 0,r=n?.autoOffTemperature,a=O(e,r),s=(h,b)=>{let y=w(e,r)?.attributes[h];return typeof y=="number"?y:j(b,a)},d=s("min",po),l=s("max",uo),u=(r?t.targetOf(r):void 0)??i?.temperature??j(kt,a),f=i?.every??!1,m=[!1,!0],g=h=>{n?.autoOffEveryPrint&&h!==f&&t.run(`every_${n.autoOffEveryPrint}`,"switch",h?"turn_on":"turn_off",{entity_id:n.autoOffEveryPrint})};return c`<h2 id="dlg-title">${o(e,"auto_off_title")}</h2>
    <p class="dlg-label" id="auto-off-temperature">${o(e,"auto_off_temperature")}</p>
    ${st({labelledBy:"auto-off-temperature",lower:{label:o(e,"auto_off_lower",{step:vt,unit:a}),disabled:!r||u<=d,onClick:()=>r&&t.stepTarget(r,Math.max(d,u-vt))},raise:{label:o(e,"auto_off_raise",{step:vt,unit:a}),disabled:!r||u>=l,onClick:()=>r&&t.stepTarget(r,Math.min(l,u+vt))},value:L(e,u,a)})}
    <p class="dlg-label" id="auto-off-when">${o(e,"auto_off_when")}</p>
    <div class="seg auto-off-when" role="radiogroup" aria-labelledby="auto-off-when" @keydown=${W} @focusout=${Z}>
      ${m.map((h,b)=>c`<button
          role="radio"
          aria-checked=${h===f?"true":"false"}
          tabindex=${b===X(m,f)?"0":"-1"}
          @click=${()=>g(h)}
        >
          ${o(e,h?"auto_off_every_choice":"auto_off_next_choice")}
        </button>`)}
    </div>
    <p class="hint">${o(e,"auto_off_dialog_note")}</p>`}function hr(t,e){let{hass:n}=t,i=Oe(t)??xt(t).find(h=>h.power);if(!i)return p;let r=Be(t,i),a=k(n,i.watts),s=a!==void 0?_e(n,a):void 0,[d,l,u]=t.unreachable?["neutral","plug",o(n,"chip_power_unknown")]:r==="unavailable"?["warn","plugOff",o(n,"chip_power_unreachable")]:r==="off"?["neutral","plugOff",o(n,"chip_power_off")]:r!=="on"?["neutral","plug",o(n,"chip_power_unknown")]:ar(t,i)?["info","timer",o(n,"auto_off_waiting_title")]:[t.online?"ok":"neutral","bolt",s??o(n,"chip_power_on")],f=!t.unreachable&&!mn(t,i)&&(r==="on"||r==="off")&&!ar(t,i),m=f?r==="on"&&s?o(n,"chip_power_plug",{plug:i.name,power:s}):o(n,"chip_power_plug_state",{plug:i.name,state:o(n,r==="on"?"on":"off")}):u,g=f?m:t.unreachable?`${m} \u2013 ${o(n,"unreachable_short")}`:o(n,"chip_power_aria",{shown:m,plug:i.name});return c`<button class="pill power-chip tone-${d}" aria-label=${g} title=${g} aria-haspopup="dialog" aria-live="off" @click=${e}>${_(l)}<span>${m}</span></button>`}var yo=t=>{let e=Math.max(0,Math.floor(t/1e3));return`${Math.floor(e/60)}:${String(e%60).padStart(2,"0")}`};function gn(t,e=Date.now()){let n=Oe(t);if(t.online||t.unreachable||!n||Be(t,n)!=="on")return;let i=q(t.hass,n,"on_since"),r=typeof i=="string"?e-new Date(i).getTime():Number.NaN;return r>=0&&r<co?r:void 0}function _n(t){let{hass:e}=t,n=Oe(t);if(t.online||t.unreachable||!n)return;let i=Be(t,n),r=k(e,n.watts),a=n.switchable&&Pe(t);if(i==="off"){let l=$t(t,n),u=l?.phase==="done"?l.since:void 0,f=u!==void 0?Xe(e,u):void 0,m=`plug_${n.power}`;return{info:c`${H(o(e,"offline_plug_off",{plug:n.name}),"info")}${f?c`<p class="hint">${o(e,"auto_off_done_at",{time:f})}</p>`:p}`,actions:a?c`<div class="offline-actions">
              ${x({label:o(e,"power_on"),iconName:"power",kind:"primary",pending:t.isPending(m),onClick:()=>t.run(m,"switch","turn_on",{entity_id:n.power})})}
            </div>`:c``}}if(i!=="on")return;let s=gn(t);if(s!==void 0)return{info:c`<div class="p-starting">
        <span class="check-spinner" aria-hidden="true"></span>
        <span class="p-text">
          <span class="p-name">${o(e,"power_starting",{time:yo(s)})}</span>
          <span class="p-sub">${o(e,"power_starting_text")}</span>
          ${r!==void 0?c`<span class="p-sub">${o(e,"power_plug_on",{power:_e(e,r)})}</span>`:p}
        </span>
      </div>`,actions:c``};let d=r===void 0?p:c`<p class="hint">${r>0?o(e,"offline_plug_on_power",{power:_e(e,r)}):o(e,"offline_plug_on_zero")}</p>`;if(!(d===p&&!a))return{info:c`${H(o(e,"offline_text"),"warning")}${d}`,actions:c`<div class="offline-actions">
      ${x({label:o(e,"check_connection"),iconName:"lan",onClick:t.checkConnection})}
      ${a?x({label:o(e,"power_off_plug"),iconName:"power",onClick:()=>hn(t,n,!1)}):p}
    </div>`}}var Ct=(t,e,n)=>fe(w(t.hass,e)?.attributes[n]),vo=t=>/^(.+) \([^()]* \/ [^()]*\)$/.exec(t)?.[1]??t,ce=t=>Ct(t,t.refs.status,"bambuddy_name")??vo(t.refs.name),mr=(t,e)=>{let n=k(t.hass,e);return n===void 0?void 0:A(t.hass,n,2)};function xo(t){let{hass:e,refs:n}=t,i=n.nozzleDiameters.map(d=>mr(t,d)),r=i.filter(d=>d!==void 0);if(!r.length)return;if(new Set(r).size===1)return`${r[0]}\xA0mm`;let[a,s]=i;return`${o(e,"side_left_short")}\xA0${a??"\u2014"} / ${o(e,"side_right_short")}\xA0${s??"\u2014"}\xA0mm`}function fr(t){let{hass:e,refs:n}=t,i=k(e,n.printHours);if(i!==void 0)return typeof e.formatEntityState=="function"?e.formatEntityState(w(e,n.printHours)):o(e,"dur_h",{h:A(e,Math.round(i))})}var gr=t=>[t.refs.model,xo(t),fr(t)].filter(Boolean).join(" \xB7 "),_r={RESUME_PRINTING:"hms_answer_resume_printing",RESUME_PRINTING_DEFECTS:"hms_answer_resume_printing_defects",RESUME_PRINTING_PROBELM_SOLVED:"hms_answer_resume_printing_probelm_solved",PROBLEM_SOLVED_RESUME:"hms_answer_problem_solved_resume",FILAMENT_LOAD_RESUME:"hms_answer_filament_load_resume",PROCEED:"hms_answer_proceed",DBL_CHECK_RESUME:"hms_answer_dbl_check_resume",STOP_PRINTING:"hms_answer_stop_printing",IGNORE_RESUME:"hms_answer_ignore_resume",IGNORE_NO_REMINDER_NEXT_TIME:"hms_answer_ignore_no_reminder_next_time",DONT_REMIND_NEXT_TIME:"hms_answer_dont_remind_next_time",NO_REMINDER_NEXT_TIME:"hms_answer_no_reminder_next_time",FILAMENT_EXTRUDED:"hms_answer_filament_extruded",DBL_CHECK_DONE:"hms_answer_dbl_check_done",RETRY_FILAMENT_EXTRUDED:"hms_answer_retry_filament_extruded",CONTINUE:"hms_answer_continue",RETRY_PROBLEM_SOLVED:"hms_answer_retry_problem_solved",DBL_CHECK_RETRY:"hms_answer_dbl_check_retry",ABORT:"hms_answer_abort",OK_BUTTON:"hms_answer_ok_button",DBL_CHECK_OK:"hms_answer_dbl_check_ok",REFRESH_NOZZLE:"hms_answer_refresh_nozzle",TURN_OFF_FIRE_ALARM:"hms_answer_turn_off_fire_alarm",STOP_DRYING:"hms_answer_stop_drying",DISABLE_PURIFICATION:"hms_answer_disable_purification"};function br(t){return Array.isArray(t.actions)?t.actions.filter(e=>typeof e=="string"&&Object.hasOwn(_r,e)):[]}function wn(t){return t.canControl&&t.online&&Ne(t).errors.some(e=>br(e).length>0)}var ko="https://wiki.bambulab.com/en/hms/home";function $o(t,e,n){let{hass:i,refs:r}=t,a=br(e);if(!a.length||!t.canControl||!t.online||typeof e.code!="string")return p;let s=e.code;return c`<div class="hms-answers">
    ${a.map(d=>{let l=`hms_${s}_${d}`,u=o(i,_r[d]),f={device_id:r.deviceId,code:s,action:d},m=d==="STOP_PRINTING";return x({label:u,iconName:m?"stop":"check",kind:m?"danger":"tonal",pending:t.isPending(l),describedBy:n,answer:l,onClick:()=>m?t.confirm(tt(i,["bambuddy","answer_hms",f],l)):t.run(l,"bambuddy","answer_hms",f)})})}
  </div>`}var wr=["error","warning","unknown","notice"];function Co(t){let e=typeof t=="string"?t.replace(/^0x/i,"").toUpperCase():"";return/^[0-9A-F]{8}([0-9A-F]{8})?$/.test(e)?e.match(/.{4}/g).join("_"):e}var St=t=>typeof t.severity=="string"&&wr.includes(t.severity)?t.severity:"unknown",yr={error:"error",warning:"warning",unknown:"warning",notice:"info"},So=t=>t==="unknown"?"warning":t,vr={error:"err",warning:"warn",unknown:"warn",notice:"info"};function yn(t){let e=n=>wr.indexOf(St(n));return[...t].sort((n,i)=>e(n)-e(i))}function Ne(t){let e=w(t.hass,t.refs.hms)?.attributes.errors,n=Array.isArray(e)?e:[],i=k(t.hass,t.refs.hms)??(Array.isArray(e)?n.length:void 0);return i===void 0?{errors:n}:{count:i,errors:n}}var vn=t=>!!t.refs.clearHms&&t.canControl&&(Ne(t).count??0)>0,To=t=>t>=-67?"ok":t>=-75?"warn":"err",Ao=(t,e)=>`${A(t.hass,e).replace(/^-/,"\u2212")}\xA0dBm`;function xr(t){let{hass:e,refs:n}=t;if(!t.online)return;if(w(e,n.wiredNetwork)?.state==="on")return{tone:"ok",iconName:"ethernet",text:o(e,"lan"),aria:o(e,"lan_aria"),entityId:n.wiredNetwork};let i=k(e,n.wifiSignal);if(i===void 0)return;let r=Ao(t,i),a=To(i),s=o(e,a==="ok"?"wifi_good":a==="warn"?"wifi_fair":"wifi_weak");return{tone:a,iconName:"wifi",text:r,aria:o(e,"wifi_signal",{value:r,quality:s}),entityId:n.wifiSignal}}function zo(t){let e=xr(t);if(!e)return p;let n=c`${_(e.iconName)}<span>${e.text}</span>`;return c`<button
    class="pill network tone-${e.tone}"
    aria-label=${e.aria??e.text}
    aria-live="off"
    @click=${()=>t.moreInfo(e.entityId)}
  >
    ${n}
  </button>`}function Do(t,e){let{hass:n}=t,{count:i,errors:r}=Ne(t);if(!t.online||i===void 0)return p;let a=yn(r)[0],s=i>0?vr[a?St(a):"unknown"]:"ok",d=i>1?o(n,"hms_pill_aria",{count:i}):i===1?o(n,"hms_pill_aria_one"):o(n,"hms_pill_none");return c`<button class="pill hms tone-${s}" aria-label=${d} title=${d} aria-haspopup="dialog" @click=${()=>e("hms")}>
    ${_(i>0?"shieldAlert":"shieldCheck")}<span>${i>0?o(n,"hms_pill",{count:i}):o(n,"hms_ok")}</span>
  </button>`}function xn(t){let{refs:e}=t,n=w(t.hass,e.firmware);if(!n)return;let i=Ct(t,e.firmware,"installed_version"),r=Ct(t,e.firmware,"latest_version");return{...i?{installed:i}:{},...r?{latest:r}:{},update:n.state==="on",current:n.state==="off"}}function Lo(t,e){let{hass:n}=t,i=xn(t);if(!i||!i.installed&&!i.update)return p;let[r,a,s]=i.update?["warn","download","firmware_update"]:!t.online&&i.installed?["neutral","memory",t.unreachable?"firmware_unreachable":"firmware_offline"]:i.current?["ok","check","firmware_current"]:["neutral","memory","firmware_version"],d=i.update&&i.latest?o(n,"firmware_update_chip",{version:i.latest}):i.installed??o(n,"firmware"),l=i.update&&i.latest&&i.installed?o(n,"firmware_update_label",{latest:i.latest,version:i.installed}):i.installed?o(n,s,{version:i.installed}):d;return c`<button class="pill firmware tone-${r}" aria-label=${l} title=${l} aria-haspopup="dialog" @click=${()=>e("firmware")}>
    ${_(a)}<span>${d}</span>
  </button>`}var Ho=new Set(["paused","failed"]);function Eo(t,e){let{hass:n}=t,{count:i,errors:r}=Ne(t);if(!t.online||!i)return p;let a=yn(r),s=a[0],d=s?St(s):"unknown";if(d!=="error"&&!Ho.has(t.status))return p;let l=fe(s?.description),u=s?l??o(n,`hms_${d}`):o(n,"hms_count",{count:i}),f=a.length-1;return c`<button class="hms-line tone-${vr[d]}" title=${u} aria-haspopup="dialog" @click=${()=>e("hms")}>
    ${_(yr[d])}<span class="hms-line-text">${u}</span>${f>0?c`<span class="hms-line-more">${o(n,"hms_more",{n:f})}</span>`:p}<span class="hms-line-go">${_("chevronRight")}</span>
  </button>`}function Ro(t){let{hass:e,refs:n}=t;return!t.online||w(e,n.door)?.state!=="on"?p:c`<button class="pill door tone-info" @click=${()=>t.moreInfo(n.door)}>${_("doorOpen")}<span>${o(e,"door_open")}</span></button>`}function Mo(t,e){let{hass:n,refs:i}=t;return!t.online||w(n,i.storage)?.state!=="off"?p:c`<button class="pill storage tone-warn" aria-haspopup="dialog" @click=${()=>e("storage")}>
    ${_(i.storageUsb?"usb":"sd")}<span>${o(n,i.storageUsb?"storage_usb":"storage_sd")}</span>
  </button>`}function Po(t){let{hass:e}=t;if(!t.online)return p;let n=t.ams.filter(f=>f.drying&&w(e,f.drying)?.state==="on"),i=n[0];if(!i)return p;let r=n.map(f=>me(e,f.dryingRemaining)).filter(f=>f!==void 0&&f>0),a=r.length?G(e,Math.max(...r)).replace(/ /g,"\xA0"):void 0,s=n.length,d=s===1?o(e,"dry_chip_one_bare"):o(e,"dry_chip_many_bare",{n:s}),l=s>1&&a?o(e,"dry_chip_aria",{n:s,time:a}):void 0,u=()=>t.filamentTab?t.show("filament"):t.moreInfo(i.dryingRemaining??i.drying);return c`<button class="pill dry-chip tone-info" title=${l??(a?`${d} ${a}`:d)} aria-live="off" @click=${u}>
    ${_("heat")}<span class="dry-text"><span>${d}</span> ${a?c`<span class="dry-time">${a}</span>`:p}</span>
  </button>`}function kr(t,e){let n={network:()=>zo(t),hms:()=>Do(t,e),firmware:()=>Lo(t,e),maintenance:()=>tr(t,()=>e("maintenance")),door:()=>Ro(t),storage:()=>Mo(t,e),drying:()=>Po(t),power:()=>hr(t,()=>e("power"))},i=t.settings.chips.map(r=>n[r]()).filter(r=>r!==p);return c`${i.length?c`<div class="pills" aria-live="polite">${i}</div>`:p}${Eo(t,e)}`}function $r(t){let{hass:e}=t,{count:n=0,errors:i}=Ne(t),r=yn(i),a=t.unreachable||!t.online?P(o(e,t.unreachable?"unreachable_short":"offline_text")):r.length?c`<div class="hms-list">
            ${r.map((l,u)=>{let f=St(l),m=Co(l.code),g=fe(l.description);return c`<div class="hms-item sev-${So(f)}">
                ${_(yr[f])}
                <div class="hms-body">
                  ${g?c`<span class="sr-only">${o(e,`hms_${f}`)}: </span>`:p}<span class="hms-text" id="hms-text-${u}">${g??o(e,"hms_no_text",{severity:o(e,`hms_${f}`)})}</span>
                  ${m?c`<span class="hms-code">${m}</span>`:p}
                  ${$o(t,l,`hms-text-${u}`)}
                </div>
              </div>`})}
          </div>`:c`<p class="hms-empty">${n>0?o(e,"hms_count",{count:n}):o(e,"hms_none_dialog")}</p>`,s=wn(t)?"hms_next_answers":t.canControl?"hms_next":t.refs.resume||t.refs.stop?"hms_next_read":"hms_next_elsewhere",d=t.status==="paused"&&n>0?P(o(e,s)):p;return c`<h2 id="dlg-title">${o(e,"hms_title")}</h2>
    ${a}
    ${r.length?c`<a class="hms-wiki" href=${ko} target="_blank" rel="noopener noreferrer">${_("openInNew")}<span>${o(e,"hms_wiki")}</span></a>`:p}
    ${d}${vn(t)?P(o(e,"hms_clear_note")):p}`}function R(t,e,n=p,i=""){return c`<div class="spec-row">
    <span class="spec-label">${t}</span>
    <span class="spec-value ${i}">${e}</span>
    ${n}
  </div>`}function Cr(t){let{hass:e,refs:n}=t,i=w(e,n.storage)?.state==="on",r=n.storageUsb?i?"storage_usb_in":"storage_usb_text":i?"storage_sd_in":"storage_sd_text",a=n.storageUsb?i?"storage_usb_title_in":"storage_usb":i?"storage_sd_title_in":"storage_sd";return c`<h2 id="dlg-title">${o(e,a)}</h2>
    <p>${o(e,r)}</p>`}function Sr(t,e){let{hass:n}=t,i=xn(t)??{update:!1,current:!1},r=()=>{e(),t.moreInfo(t.refs.firmware)};return c`<h2 id="dlg-title">${o(n,"firmware")}</h2>
    <div class="spec">
      ${i.installed?R(o(n,"firmware_installed"),i.installed):p}
      ${i.latest?R(o(n,i.update?"firmware_available":"firmware_latest"),i.latest,p,i.update?"update":""):p}
    </div>
    ${i.update?c`<button class="btn release" @click=${r}>${_("openInNew")}<span>${o(n,"firmware_notes")}</span></button>`:p}
    ${P(o(n,"firmware_note"))}`}var Oo=()=>typeof navigator.clipboard?.writeText=="function";function Bo(t){let{hass:e,refs:n}=t;return n.nozzles.map((i,r)=>{let a=mr(t,n.nozzleDiameters[r]),s=n.nozzleTypes[r],d=[a===void 0?void 0:`${a}\xA0mm`,z(e,s)?D(e,s):void 0].filter(Boolean).join(" \xB7 ");return d&&n.dual?o(e,"nozzle_side",{side:ye(e,r),nozzle:d}):d}).filter(Boolean)}var bn=(t,e)=>c`<span class="chip tone-${t}">${e}</span>`;function No(t,e){let{hass:n,refs:i}=t;if(!e.length)return p;let r=i.nozzles.length,a=r===1?o(n,"nozzle_count_one"):o(n,"nozzle_count",{count:r});return i.dual?R(o(n,"info_nozzles"),c`<span>${a}</span>
      ${e.map(s=>c`<span class="spec-sub">${s}</span> `)}`,p,"lines"):R(o(n,"info_nozzles"),[a,...e].join(" \xB7 "))}function Tr(t,e,n){let{hass:i,refs:r}=t,a=($,v)=>Oo()?c`<button class="icon-btn copy" aria-label=${o(i,$)} title=${o(i,$)} @click=${()=>n(v)}>${_("copy")}</button>`:p,s=Ct(t,r.status,"bambuddy_name"),d=z(i,r.ipAddress)?w(i,r.ipAddress)?.state:void 0,l=i.devices[r.deviceId],u=l?.serial_number||void 0,f=l?.via_device_id?i.devices[l.via_device_id]:void 0,m=xr(t),g=z(i,r.developerMode)?w(i,r.developerMode)?.state==="on":void 0,h=Bo(t),b=fr(t),y=xn(t)?.installed;return c`<h2 id="dlg-title">${o(i,"menu_info")}</h2>
    <div class="spec">
      ${r.model?R(o(i,"info_model"),r.model):p}
      ${s?R(o(i,"info_name"),s):p}
      ${f&&Me(f)?R(o(i,"info_server"),Me(f)):p}
      ${R(o(i,"info_status"),bn(t.online?"ok":t.unreachable?"warn":"off",o(i,be(t))))}
      ${t.online?R(o(i,"info_print_status"),D(i,r.status,t.status)??t.status):p}
      ${d?R(o(i,"info_ip"),d,a("copy_ip",d)):p}
      ${u?R(o(i,"info_serial"),u,a("copy_serial",u)):p}
      ${m?R(o(i,"info_network"),m.iconName==="wifi"?`${o(i,"wifi")} \xB7 ${m.text}`:o(i,"lan_wired")):p}
      ${y?R(o(i,"firmware"),y):p}
      ${g===void 0?p:g?R(o(i,"info_developer"),bn("ok",o(i,"info_on"))):R(o(i,"info_developer"),c`${bn("warn",o(i,"info_off"))} <span class="spec-sub">${o(i,"info_developer_note")}</span>`,p,"lines")}
      ${No(t,h)}
      ${b?R(o(i,"info_hours"),b):p}
    </div>
    ${e?rt("dlg-snack",o(i,"copied")):p}`}var E={temperature:55,duration:8,minTemperature:45,maxTemperature:85,maxTemperatureAms2Pro:65,minDuration:1,maxDuration:24},Ar={temperature:["dry_temperature_lower","dry_temperature_raise"],duration:["dry_duration_lower","dry_duration_raise"]},Hr=[["PLA","GFL99","PLA"],["PLA Silk","GFL96","PLA"],["PLA High Speed","GFL95","PLA"],["PLA-CF","GFL98","PLA-CF"],["PETG","GFG99","PETG"],["PETG HF","GFG96","PETG"],["PETG-CF","GFG98","PETG-CF"],["PCTG","GFG97","PCTG"],["ABS","GFB99","ABS"],["ASA","GFB98","ASA"],["PC","GFC99","PC"],["PA","GFN99","PA"],["PA-CF","GFN98","PA-CF"],["PPA-CF","GFN97","PPA-CF"],["PPA-GF","GFN96","PPA-GF"],["TPU","GFU99","TPU"],["TPU for AMS","GFU98","TPU"],["PVA","GFS99","PVA"],["HIPS","GFS98","HIPS"],["BVOH","GFS97","BVOH"],["PE","GFP99","PE"],["PE-CF","GFP98","PE-CF"],["PP","GFP97","PP"],["PP-CF","GFP96","PP-CF"],["PP-GF","GFP95","PP-GF"],["EVA","GFR99","EVA"],["PHA","GFR98","PHA"],["PPS","GFT97","PPS"],["PPS-CF","GFT98","PPS-CF"]],Fo=Hr.map(([t])=>t),Tt="keep",Vo=.02,Q="keep",Er=[{color:"#FFFFFF",name:"color_white"},{color:"#000000",name:"color_black"},{color:"#8E9089",name:"color_gray"},{color:"#A6A9AA",name:"color_silver"},{color:"#C12E1F",name:"color_red"},{color:"#FF6A13",name:"color_orange"},{color:"#F4EE2A",name:"color_yellow"},{color:"#00AE42",name:"color_green"},{color:"#00A6A0",name:"color_turquoise"},{color:"#0086D6",name:"color_cyan"},{color:"#0A2989",name:"color_blue"},{color:"#5E43B7",name:"color_purple"},{color:"#F55A74",name:"color_pink"},{color:"#9D432C",name:"color_brown"},{color:"#F7E6DE",name:"color_beige"},{color:"#E4BD68",name:"color_gold"}],$n=t=>Er.some(e=>e.color===t);function Cn(t){let e=t.material!==void 0&&t.material!==Q?{material:t.material}:{},n=t.color,i=n!==void 0&&n!==t.current,r=t.kprofile!==void 0&&t.kprofile!==Tt?Number(t.kprofile):void 0,a=typeof t.kprofiles=="object"?t.kprofiles.current:void 0,s=r!==void 0&&("material"in e?r!==-1:r!==a);return{...e,...i?{color:Xt(n)}:{},...s?{k_profile:r}:{}}}function Sn(t){let e=t.kprofiles;if(typeof e!="object")return;let{id:n,type:i}=Mr(t),r=e.profiles.find(a=>Rr(a,n,i));return r?String(r.index):void 0}function Rr(t,e,n){return e!==void 0&&t.filamentId===e||n!==""&&t.name.toUpperCase().includes(n.toUpperCase())}function Mr(t){let e=Hr.find(([i])=>i===t.material);if(e)return{name:e[0],id:e[1],type:e[2]};let n=t.type??"";return{name:n,type:n}}function zr(t,e,n){let{label:i,field:r,value:a,unit:s,min:d,max:l,step:u}=n,f=`dry-${r}`,m=r==="duration"?o(t,"hours_long"):s;return c`<div class="field">
    <label for=${f}>${i}<span class="sr-only"> (${m})</span></label>
    <div class="stepper">
      <button class="btn icon-only" aria-label=${o(t,Ar[r][0])} ?disabled=${a<=d} @click=${()=>e.setDrying(r,a-u)}>
        ${_("minus")}
      </button>
      <input
        id=${f}
        type="number"
        inputmode="numeric"
        min=${d}
        max=${l}
        .value=${String(a)}
        @change=${g=>{let h=g.target;h.value=String(e.setDrying(r,h.value.trim()===""?Number.NaN:Number(h.value)))}}
      />
      <span class="unit-text">${s}</span>
      <button class="btn icon-only" aria-label=${o(t,Ar[r][1])} ?disabled=${a>=l} @click=${()=>e.setDrying(r,a+u)}>
        ${_("plus")}
      </button>
    </div>
  </div>`}function Io(t,e){if(e.differing.length){let i=e.differing.map(r=>`${r.material}\xA0${L(t,r.temperature)}`).join(" \xB7 ");return c`<p class="dlg-suggested mixed">${_("info")}<span>${o(t,"dry_mixed",{spools:i})}</span></p>`}if(!e.suggested)return p;let n=e.suggestedFor?o(t,"dry_suggested_for",{filaments:e.suggestedFor}):o(t,"dry_suggested");return c`<p class="dlg-suggested">${_("check")}<span>${n}</span></p>`}function Ko(t,e,n){return c`<h2 id="dlg-title">${o(t,"dry_title",{unit:e.unit.name})}</h2>
    ${zr(t,n,{label:o(t,"dry_temperature"),field:"temperature",value:e.temperature,unit:"\xB0C",min:E.minTemperature,max:e.maxTemperature,step:5})}
    ${zr(t,n,{label:o(t,"dry_duration"),field:"duration",value:e.duration,unit:o(t,"hours"),min:E.minDuration,max:E.maxDuration,step:1})}
    ${Io(t,e)}
    <p class="dlg-range">
      ${L(t,E.minTemperature)} – ${L(t,e.maxTemperature)} · ${E.minDuration}–${E.maxDuration}
      ${o(t,"hours")}
    </p>`}var Pr=t=>t.chosen.length>0&&t.objects.every(e=>e.skipped||t.chosen.includes(e.id));function Uo(t,e,n){let i;return e.loading?i=c`<p role="status">${o(t,"skip_loading")}</p>`:e.error?i=c`<div class="dlg-error" role="alert">${_("error")}<span>${e.error}</span></div>`:e.objects.length?e.objects.length===1?i=c`<p class="dlg-warn info">${_("info")}<span>${o(t,"skip_single")}</span></p>`:i=c`<div class="objects" role="group" aria-labelledby="dlg-title">
        ${e.objects.map(r=>c`<label class="obj ${r.skipped?"skipped":""}">
            <input
              type="checkbox"
              .checked=${e.chosen.includes(r.id)}
              ?disabled=${r.skipped}
              @change=${()=>n.toggleObject(r.id)}
            />
            <span class="obj-name">${r.name||o(t,"skip_object",{id:r.id})}</span>
            ${r.skipped?c`<span class="obj-note">${o(t,"skip_skipped")}</span>`:p}
          </label>`)}
      </div>
      <p class="dlg-warn">${_("warning")}<span>${o(t,Pr(e)?"skip_all":"skip_text")}</span></p>`:i=c`<p>${o(t,"skip_none_listed")}</p>`,c`<h2 id="dlg-title">${o(t,"skip")}</h2>
    ${i}`}function Dr(t,e,n,i,r){return c`<button
    class="pal ${Qe(n)?"outline":""}"
    role="radio"
    aria-checked=${t.color===n?"true":"false"}
    aria-label=${i}
    title=${i}
    tabindex=${r?0:-1}
    style="--c: ${n}"
    @click=${()=>e.setColor(n)}
  ></button>`}function jo(t){let e=t.key==="ArrowRight"||t.key==="ArrowDown"?1:t.key==="ArrowLeft"||t.key==="ArrowUp"?-1:0,n=[...t.currentTarget.querySelectorAll("[role=radio]")],i=n.indexOf(t.target);if(!e||i<0)return;t.preventDefault();let r=n[(i+e+n.length)%n.length];r.focus(),r.click()}function Go(t,e,n){let i=e.kprofiles,r=typeof i=="object"?i.profiles:[],a=typeof i=="object"?i.current:-1,s=e.material===Q,{name:d,id:l,type:u}=Mr(e),f=T=>Rr(T,l,u),m=r.filter(f),g=r.filter(T=>!f(T)).sort((T,C)=>T.name.localeCompare(C.name)),h=T=>`${T.name} (K ${qt(t,T.k,3)})`,b=s?r.find(T=>T.index===a):void 0,y=s?b?o(t,"k_keep",{profile:h(b)}):a>=0?o(t,"k_keep_number",{index:a}):i==="failed"?o(t,e.ams?"k_keep_plain":"k_keep_plain_spool"):void 0:void 0,$=e.kprofile??(y?Tt:"-1"),v=g.some(T=>String(T.index)===$),F=i==="failed"?e.ams?"k_failed":"k_failed_spool":typeof i=="object"&&!r.length?"k_none":v&&e.material!==void 0?e.ams?"k_other_note":"k_other_note_spool":"k_unsure",ee=T=>c`<option value=${String(T.index)} .selected=${$===String(T.index)}>${h(T)}</option>`;return c`<div class="field kfield">
      <label for="fil-k">${o(t,"k_profile")}</label>
      <span class="select">
        <select id="fil-k" aria-describedby="k-hint" ?disabled=${i==="loading"} @change=${T=>n.setKProfile(T.target.value)}>
          ${i==="loading"?c`<option selected>${o(t,"k_loading")}</option>`:c`${y?c`<option value=${Tt} .selected=${$===Tt}>${y}</option>`:p}
                <option value="-1" .selected=${$==="-1"}>${o(t,"k_default",{k:qt(t,Vo,3)})}</option>
                ${m.length?c`<optgroup label=${o(t,"k_matching",{material:u||d})}>${m.map(ee)}</optgroup>`:p}
                ${g.length?c`<optgroup label=${o(t,"k_others")}>${g.map(ee)}</optgroup>`:p}`}
        </select>
        ${_("chevronDown")}
      </span>
      <span class="k-hint" id="k-hint" aria-live="polite">${o(t,F)}</span>
    </div>`}function Lr(t,e,n){let{hass:i,refs:r}=t,a=t.running,s=!e.ams,d=r.ams.flatMap(f=>f.slots.flatMap((m,g)=>B(i,m).active?[ut(i,f,m,g)]:[]))[0],l=r.externalSpools.findIndex(f=>B(i,f).active),u=d?o(i,"rfid_unload_hint",{slots:d}):l<0?void 0:o(i,r.externalSpools.length>1?l===0?"rfid_unload_hint_left":"rfid_unload_hint_right":"rfid_unload_hint_external");return c`<div class="slot-tools">
      ${e.ams?x({label:o(i,"rfid_read"),iconName:"sync",disabled:a||u!==void 0,onClick:n.refreshRfid}):p}
      ${e.empty?p:x({label:o(i,s?"spool_reset":"slot_reset"),iconName:"restore",disabled:a,onClick:n.resetSlot})}
    </div>
    ${a?P(o(i,s?"spool_tools_running":"slot_tools_running")):e.ams&&u?P(u):p}`}function Wo(t,e,n){let{hass:i}=t;if(e.rfid)return c`<h2 id="dlg-title">${e.title}</h2>
      <p>${o(i,"filament_rfid")}</p>
      ${e.spool?c`<p class="rfid-spool">${e.spool}</p>`:p}
      ${Lr(t,e,n)}`;let r=Er.map(l=>({color:l.color,label:o(i,l.name)})),a=e.custom?{color:e.custom,label:o(i,e.custom===e.current?"color_current":"color_chosen")}:void 0,s=Math.max(0,[...r,...a?[a]:[]].findIndex(l=>l.color===e.color)),d=l=>n.pickColor(l.target.value);return c`<h2 id="dlg-title">${e.title}</h2>
    <div class="field">
      <label for="fil-material">${o(i,"material")}</label>
      <span class="select">
        <select id="fil-material" class=${e.material===void 0?"unset":""} @change=${l=>n.setMaterial(l.target.value)}>
          ${e.keep===void 0?c`<option value="" disabled .selected=${e.material===void 0}>${o(i,"material_choose")}</option>`:c`<option value=${Q} .selected=${e.material===Q}>${o(i,"material_keep",{name:e.keep})}</option>`}
          ${Fo.map(l=>c`<option value=${l} .selected=${e.material===l}>${l}</option>`)}
        </select>
        ${_("chevronDown")}
      </span>
    </div>
    <div class="colors">
      <span class="field-label">${o(i,"color")}</span>
      <div class="palette" role="radiogroup" aria-label=${o(i,"color")} @keydown=${jo}>
        <div class="swatches">${r.map((l,u)=>Dr(e,n,l.color,l.label,u===s))}</div>
        <div class="other-row">
          ${a?Dr(e,n,a.color,a.label,s===r.length):p}
          <label class="btn plain other-color"
            >${_("palette")}<span>${o(i,"color_other")}</span
            ><input type="color" .value=${(e.color??e.custom??"#FFFFFF").toLowerCase()} @input=${d} @change=${d}
          /></label>
        </div>
      </div>
    </div>
    ${Go(i,e,n)}
    ${P(o(i,"filament_note"))}
    ${Lr(t,e,n)}`}function Zo(t,e){let{hass:n}=t;switch(e.kind){case"confirm":return{keep:e.keep??o(n,"cancel"),confirm:e.confirm,danger:e.danger===!0,ready:!0};case"drying":return{keep:o(n,"cancel"),confirm:o(n,"dry_start"),danger:!1,ready:!0};case"filament":return e.rfid?{keep:o(n,"dismiss"),danger:!1,ready:!1}:{keep:o(n,"cancel"),confirm:o(n,"filament_set"),danger:!1,ready:e.material!==void 0&&Object.keys(Cn(e)).length>0,...e.material===void 0&&(e.color!==void 0||e.kprofile!==void 0)?{need:o(n,"filament_need_material")}:{}};case"hms":return{keep:o(n,"dismiss"),...vn(t)?{confirm:o(n,"hms_clear")}:{},danger:!1,ready:!0,quiet:wn(t)};case"firmware":case"info":case"storage":case"maintenance":case"power":case"auto_off":case"camera":return{keep:o(n,"dismiss"),danger:!1,ready:!1};case"check":return{keep:o(n,"dismiss"),...e.running?{}:{confirm:o(n,"check_again")},danger:!1,ready:!e.running};case"skip":{if(!e.loading&&(e.error||e.objects.length<=1))return{keep:o(n,"dismiss"),danger:!0,ready:!1};let i=e.chosen.length,r=i===0?o(n,"skip"):i===1?o(n,"skip_one"):o(n,"skip_many",{count:i});return{keep:o(n,"cancel"),confirm:r,danger:!0,ready:i>0&&!Pr(e)}}}}function qo(t,e,n){let{hass:i}=t;switch(e.kind){case"confirm":return c`<h2 id="dlg-title">${e.title}</h2>
        <p id="dlg-text">${e.text}</p>
        ${e.note?P(e.note,e.noteTone,"dlg-note"):p}`;case"drying":return Ko(i,e,n);case"filament":return Wo(t,e,n);case"skip":return Uo(i,e,n);case"hms":return $r(t);case"firmware":return Sr(t,n.close);case"info":return Tr(t,e.copied===!0,n.copy);case"storage":return Cr(t);case"power":return pr(t);case"auto_off":return ur(t);case"camera":return Yo(t,n);case"maintenance":return nr(t,e,n);case"check":return Di(t,e,n,n.now())}}function Yo(t,e){let{hass:n,refs:i}=t,r=i.cameraFps,a=n.states[r]?.attributes??{},s=($,v)=>typeof $=="number"?$:v,d=t.targetOf(r),l=s(a.min,5),u=s(a.max,Math.max(l,d??l)),f=s(a.step,5),m=d??u,g=i.camera?n.states[i.camera]?.attributes:void 0,h=g?.frame_rate,b=g?.streamed_frame_rate,y=typeof b=="number"&&typeof h=="number"&&Math.abs(b-h)>2;return c`<h2 id="dlg-title">${o(n,"fps_title")}</h2>
    ${st({lower:{label:o(n,"fps_lower",{step:f}),disabled:m<=l,onClick:()=>t.stepTarget(r,Math.max(l,m-f))},raise:{label:o(n,"fps_raise",{step:f}),disabled:m>=u,onClick:()=>t.stepTarget(r,Math.min(u,m+f))},value:c`<span aria-hidden="true">${o(n,"fps_value",{fps:m})}</span><span class="sr-only">${o(n,"fps_aria",{fps:m})}</span>`})}
    <p class="hint">${o(n,"fps_note",{max:u})}</p>
    ${y?c`${P(o(n,"fps_arriving",{now:b}),"warning","fps-arriving")}
          <button class="btn tonal fps-restart" @click=${e.restartLive}>${_("restore")}<span>${o(n,"fps_restart")}</span></button>`:p}`}var kn=new WeakSet;function Or(t,e,n,i=p){let{keep:r,confirm:a,danger:s,ready:d,need:l,quiet:u}=Zo(t,e),f=b=>{let y=b.currentTarget;b.target===y?kn.add(y):kn.delete(y)},m=b=>{let y=b.currentTarget;kn.delete(y)&&b.target===y&&n.close()},g=e.kind==="confirm",h=g?e.note?"dlg-text dlg-note":"dlg-text":void 0;return c`<dialog
    role=${g&&s?"alertdialog":p}
    aria-labelledby="dlg-title"
    aria-describedby=${h??p}
    @cancel=${n.cancel}
    @close=${n.close}
    @pointerdown=${f}
    @click=${m}
  >
    <div class="dlg-body">
      ${qo(t,e,n)}
      ${i}
      <div class="dlg-actions">
        ${l?c`<span class="dlg-need">${l}</span>`:p}
        <button class="btn plain safe" autofocus @click=${n.close}>${r}</button>
        ${a===void 0?p:c`<button class="btn ${s?"danger":u?"tonal":"primary"}" ?disabled=${!d} @click=${n.confirm}>${a}</button>`}
      </div>
    </div>
  </dialog>`}var Xo=["load_title_left","load_title_right"],Jo=["filament_title_left","filament_title_right"],Qo=["edit_external_left","edit_external_right"];function es(t,e,n,i){return!t.canControl||!t.online||!e.present||t.running&&e.active?p:x({label:i,iconName:"pencil",iconOnly:!0,kind:"plain",className:"edit",disabled:t.changing,pending:t.isPending(`filament_${e.entityId}`),onClick:()=>t.setFilament(e,n)})}function Br(t,e,n){let{hass:i,refs:r}=t,a=e.unknown?"\u2014":e.empty?Qt(i,e):e.name||e.type,s=e.name.toLowerCase().includes(e.type.toLowerCase()),d=e.active?c`<span class="in-use">${o(i,"in_use")}</span>`:void 0,l=[n.side??"",e.empty||!e.name||s?"":e.type,e.empty||e.remaining===void 0?"":M(i,e.remaining)].filter(Boolean),u=t.status==="paused"?{note:o(i,"paused_change")}:{},f=p;return t.canControl&&e.active?f=x({label:o(i,"unload"),iconName:"unload",disabled:!n.canAct,pending:t.isPending("unload"),onClick:()=>t.confirm({title:o(i,"unload_title"),text:o(i,n.nozzle?n.nozzle==="left"?"unload_text_left":"unload_text_right":"unload_text"),confirm:o(i,"unload"),...u,action:["bambuddy","unload_filament",{device_id:r.deviceId}],key:"unload"})}):t.canControl&&!e.empty&&!e.unknown&&n.canLoad&&(f=x({label:o(i,"load"),aria:n.loadName,iconName:"load",disabled:!n.canAct,pending:t.isPending(`load_${e.entityId}`),onClick:()=>t.confirm({title:n.loadTitle(a),text:o(i,n.nozzle?n.nozzle==="left"?"load_text_left":"load_text_right":"load_text"),confirm:o(i,"load"),...u,action:["bambuddy","load_filament",{entity_id:e.entityId}],key:`load_${e.entityId}`})})),c`<div class="slot ${e.active?"active":""}">
    <button
      class="slot-main"
      aria-label=${o(i,"slot_named",{shown:[e.unknown?o(i,"unknown"):a,...e.active?[o(i,"in_use")]:[],...l].join(" \xB7 "),place:n.place})}
      @click=${()=>t.moreInfo(e.entityId)}
    >
      ${Ee(e,"large")}
      <span class="slot-text">
        <span class="slot-name">${a}</span>
        ${l.length||d?c`<span class="slot-sub">${d}${d&&l.length?" \xB7 ":""}${l.join(" \xB7 ")}</span>`:p}
      </span>
    </button>
    ${es(t,e,n.title,n.editLabel??o(i,"set_filament"))} ${f}
  </div>`}var ts=["AMS 2 Pro","AMS HT"];function ns(t,e){let{hass:n}=t;if(!e.drying||!ts.includes(e.model))return p;let i=w(n,e.drying)?.state==="on",r=me(n,e.dryingRemaining),a=r?G(n,r).replace(/ /g,"\xA0"):void 0,s=w(n,e.drying)?.attributes.target_temperature,d=i&&typeof s=="number"&&s>0?L(n,s):void 0,l=z(n,e.drying)?i?d?a?o(n,"drying_at",{temperature:d,time:a}):o(n,"drying_now_at",{temperature:d}):a?o(n,"drying",{time:a}):o(n,"drying_now"):o(n,"not_drying"):"\u2014",u=`dry_${e.deviceId}`,f=w(n,e.drying)?.attributes.remote_start!==!1,m=()=>t.confirm({title:o(n,"dry_stop_title"),text:a?o(n,"dry_stop_text",{unit:e.name,time:a}):o(n,"dry_stop_now",{unit:e.name}),confirm:o(n,"dry_stop"),keep:o(n,"dry_keep"),action:["bambuddy","stop_drying",{device_id:e.deviceId}],key:u});return c`<div class="drying ${i?"on":""}">
    ${_("heat")}<span class="drying-text">${l}</span>
    ${t.canControl&&!f?c`<span class="dry-where">${o(n,"dry_at_printer")}</span>`:p}
    ${t.canControl&&f?x({kind:"plain",disabled:!t.online||!i&&t.changing,pending:t.isPending(u),...i?{label:o(n,"dry_stop"),aria:o(n,"dry_stop_named",{unit:e.name}),iconName:"stop",onClick:m}:{label:o(n,"dry"),aria:o(n,"dry_named",{unit:e.name}),iconName:"heat",onClick:()=>t.dry(e)}}):p}
  </div>`}function is(t,e,n){let{hass:i}=t,r=k(i,e.humidity),a=k(i,e.temperature),s=e.model===se,d=dt(t.ams,e),l=ct(i,e),u=t.amsUnfolded(e),f=`slots-${e.deviceId}`;return c`<section class="unit ${u?"open":"folded"}">
    <button
      class="unit-head"
      aria-expanded=${u?"true":"false"}
      aria-controls=${u?f:p}
      @click=${()=>t.toggleAms(e,!u)}
    >
      <span class="unit-title">
        <span class="unit-name">${e.name}</span>
        ${d?c`<span class="unit-model">${d}</span>`:p}
        ${l?c`<span class="unit-nozzle" title=${o(i,l==="left"?"nozzle_left":"nozzle_right")}
              >${_("nozzle")}<span aria-hidden="true">${o(i,l==="left"?"side_left_short":"side_right_short")}</span
              ><span class="sr-only">${o(i,l==="left"?"nozzle_left":"nozzle_right")}</span></span
            >`:p}
        <span class="unit-end">
        <span class="unit-env">
          ${r!==void 0?c`<span title=${o(i,"humidity")}
                ><span class="sr-only">${o(i,"strip_humidity",{humidity:M(i,r)})}</span
                ><span aria-hidden="true">${_("humidity")}${M(i,r)}</span></span
              >`:p}
          ${a!==void 0?c`<span title=${o(i,"temperature")}
                ><span class="sr-only">${o(i,"strip_temperature",{temperature:N(i,e.temperature,a)})}</span
                ><span aria-hidden="true">${_("chamber")}${N(i,e.temperature,a)}</span></span
              >`:p}
        </span>
        <span class="unit-fold">${_("chevronDown")}</span>
        </span>
      </span>
      ${u?p:c`<span class="unit-colors">${e.slots.map(m=>Ee(B(i,m)))}</span>`}
    </button>
    ${ns(t,e)}
    ${u?c`<div class="slots" id=${f} role="region" aria-label=${e.name}>
            ${e.slots.map((m,g)=>{let h=ut(i,e,m,g);return Br(t,B(i,m),{canAct:n,canLoad:!s,title:o(i,"filament_title",{slot:h}),loadTitle:b=>o(i,"load_title_from",{filament:b,place:h}),loadName:o(i,"load_from",{place:h}),place:h,editLabel:o(i,"edit_slot",{slot:h}),...l?{nozzle:l}:{}})})}
          </div>
          ${s&&t.canControl?c`<p class="hint">${o(i,"ht_load")}</p>`:p}`:p}
  </section>`}var rs=new Set(["paused_by_user","paused_filament_runout","paused_by_gcode"]);function as(t){if(!t.online||t.status!=="paused"||!t.canControl||t.changing)return p;let e=w(t.hass,t.refs.stage)?.state,n=!!e?.startsWith("paused_")&&!rs.has(e);return we(o(t.hass,n?"filament_paused_fault":"filament_paused"),t.refs.resume?at(t):p)}function os(t){let{hass:e,refs:n}=t,i=n.filamentBackup,r=w(e,i);if(!i||!r||!t.ams.length)return p;let a=o(e,"backup"),s=r.state==="on"||r.state==="off",d=c`<span class="det-text">
    <span class="det-name">${a}</span>
    <span class="det-sub" id="backup-sub">${o(e,"backup_sub")}</span>
    ${n.dual?c`<span class="det-sub">${o(e,"backup_dual")}</span>`:p}
    ${s?p:c`<span class="det-sub" id="backup-unknown">${o(e,"backup_unknown")}</span>`}
  </span>`,l=t.isPending(`switch_${i}`),u=!t.online||r.state==="unavailable",f;if(!t.canControl)f=c`<span class="det-state">${o(e,r.state==="on"?"on":r.state==="off"?"off":"unknown")}</span>`;else if(s){let g=t.switchOn(i);f=c`<button
      class="det-switch"
      role="switch"
      aria-label=${a}
      aria-describedby="backup-sub"
      aria-checked=${g?"true":"false"}
      aria-busy=${l?"true":"false"}
      aria-disabled=${l?"true":p}
      ?disabled=${u}
      @click=${()=>t.toggleSwitch(i)}
    >
      <span class="toggle" aria-hidden="true"><span class="knob"></span></span>
    </button>`}else f=c`<span class="det-state">${o(e,"unknown")}</span>
      <div class="backup-set" role="group" aria-label=${a} aria-describedby="backup-sub backup-unknown">
        ${["off","on"].map(g=>c`<button
            class="btn tonal ${l?"pending":""}"
            ?disabled=${u}
            aria-busy=${l?"true":"false"}
            aria-disabled=${l?"true":p}
            @click=${l?p:()=>t.run(`switch_${i}`,"switch",g==="on"?"turn_on":"turn_off",{entity_id:i})}
          >
            ${o(e,g==="on"?"backup_turn_on":"backup_turn_off")}
          </button>`)}
      </div>`;let m=t.canControl&&!s;return c`<section class="backup"><div class="det-row ${m?"choosing":""}">${d}${f}</div></section>`}function Tn(t){let{hass:e,refs:n}=t,i=!t.canControl||!t.online?void 0:t.running?["filament_pause","warning"]:t.changing?[t.status==="paused"?"changing_paused":"changing_reason","info"]:void 0,r=t.canControl&&t.online&&!t.running&&!t.changing,a=n.externalSpools.length>1,s=pt(t);return c`${le(t)}${i?H(o(e,i[0]),i[1]):p}${as(t)}
    ${s?c`<div class="activity" role="status">
          ${_("sync")}<span class="sr-only">${ce(t)}: </span><span>${s}</span><span class="activity-bar" aria-hidden="true"></span>
        </div>`:p}
    ${t.ams.map(d=>is(t,d,r))}
    ${os(t)}
    ${n.externalSpools.length?c`<section class="unit">
          <div class="unit-head"><span class="unit-name">${o(e,a?"externals":"external")}</span></div>
          <div class="slots">
            ${n.externalSpools.map((d,l)=>Br(t,B(e,d),{canAct:r,canLoad:!0,title:o(e,a?Jo[l]:"filament_title_external"),loadTitle:u=>o(e,a?Xo[l]:"load_title_external",{filament:u}),loadName:o(e,a?l===0?"load_from_left":"load_from_right":"load_from_external"),place:o(e,a?l===0?"external_left_place":"external_right_place":"external"),editLabel:o(e,a?Qo[l]:"edit_external"),...a?{nozzle:l===0?"left":"right"}:{},...a?{side:ye(e,l)}:{}}))}
          </div>
        </section>`:p}`}var An=t=>({allowed:()=>t.join(", "),check:e=>typeof e=="string"&&t.includes(e)}),zn=t=>({allowed:()=>o(void 0,"allowed_list",{values:t.join(", ")}),check:e=>Array.isArray(e)&&e.every(n=>typeof n=="string"&&t.includes(n))}),At={allowed:()=>"true, false",check:t=>typeof t=="boolean"},ss={printer:{allowed:()=>o(void 0,"allowed_device"),check:t=>typeof t=="string"},camera:An(an),status_blocks:zn(ft),header_chips:zn(on),start_view:An(sn),show_control_tab:At,control_sections:zn(gt),read_only:At,show_filament_tab:At,ams_folding:An(ln),show_auto_off:At};function Lt(t){if(t===null||typeof t!="object"||Array.isArray(t))throw new Error(o(void 0,"invalid_option",{option:"type",value:JSON.stringify(t),allowed:"custom:bambuddy-printer-card"}));let e=Object.fromEntries(Object.entries(t).filter(([,n])=>n!==null).map(([n,i])=>[n,Array.isArray(i)?[...new Set(i)]:n==="camera"&&i===!1?"off":i]));for(let[n,i]of Object.entries(ss)){let r=e[n];if(r!==void 0&&!i.check(r))throw new Error(o(void 0,"invalid_option",{option:n,value:JSON.stringify(r),allowed:i.allowed()}))}return e}var S={camera:"tap",blocks:ft,chips:Li,startView:"status",controlTab:!0,sections:gt,readOnly:!1,filamentTab:!0,amsFolding:"auto",showAutoOff:!0},Vr=t=>({camera:t.camera??S.camera,blocks:t.status_blocks??S.blocks,chips:t.header_chips??S.chips,startView:t.start_view??S.startView,controlTab:t.show_control_tab??S.controlTab,sections:t.control_sections??S.sections,readOnly:t.read_only??S.readOnly,filamentTab:t.show_filament_tab??S.filamentTab,amsFolding:t.ams_folding??S.amsFolding,showAutoOff:t.show_auto_off??S.showAutoOff}),Ir=t=>({...Object.fromEntries(Object.entries(Hn).map(([e,n])=>[e,Array.isArray(n)?[...n]:n])),...t}),Hn={camera:S.camera,status_blocks:S.blocks,header_chips:S.chips,start_view:S.startView,show_control_tab:S.controlTab,control_sections:S.sections,read_only:S.readOnly,show_filament_tab:S.filamentTab,ams_folding:S.amsFolding,show_auto_off:S.showAutoOff};function Kr(t,e,n){let i={...t};for(let r of new Set([...Object.keys(e),...Object.keys(n)]))JSON.stringify(n[r])!==JSON.stringify(e[r])&&(n[r]===void 0||r in Hn&&JSON.stringify(n[r])===JSON.stringify(Hn[r])?delete i[r]:i[r]=n[r]);return i}var Nr={printer:"editor_printer",camera:"editor_camera",status_blocks:"editor_blocks",header_chips:"editor_chips",start_view:"editor_start_view",show_control_tab:"editor_control_tab",control_sections:"editor_sections",read_only:"editor_read_only",show_filament_tab:"editor_filament_tab",ams_folding:"editor_ams_folding",show_auto_off:"editor_show_auto_off"},Fr={printer:"editor_printer_help",camera:"editor_camera_help",status_blocks:"editor_blocks_help",header_chips:"editor_chips_help",show_control_tab:"editor_control_tab_help",control_sections:"editor_sections_help",read_only:"editor_read_only_help",show_filament_tab:"editor_filament_tab_help",ams_folding:"editor_ams_folding_help",show_auto_off:"editor_show_auto_off_help"};function Ur(t,e){let n=e.start_view,i=e.control_sections,r=Array.isArray(i)&&i.every(d=>d==="motion"),a=e.show_control_tab===!1||Array.isArray(i)&&!i.length||e.read_only===!0&&r;return n==="control"&&a||n==="filament"&&e.show_filament_tab===!1?o(t,"editor_start_hidden",{tab:o(t,`tab_${n}`)}):void 0}var jr=(t,e,n)=>n.map(i=>({value:i,label:o(t,`${e}_${i}`)})),Dn=(t,e,n,i)=>({name:e,required:!0,selector:{select:{mode:"dropdown",options:jr(t,n,i)}}}),Ln=(t,e,n,i)=>({name:e,selector:{select:{multiple:!0,reorder:!0,options:jr(t,n,i)}}}),zt=t=>({name:t,selector:{boolean:{}}}),Dt=(t,e,n,i)=>({name:"",type:"expandable",title:o(t,e),icon:n,schema:i});function Gr(t){return{schema:[{name:"printer",required:!0,selector:{device:{filter:{integration:"bambuddy"},entity:{integration:"bambuddy",domain:"sensor",device_class:"enum"}}}},Dt(t,"editor_group_general","mdi:cog-outline",[Dn(t,"start_view","tab",sn),Dn(t,"camera","camera",an),Ln(t,"header_chips","chip",on),zt("read_only")]),Dt(t,"editor_group_status","mdi:printer-3d",[Ln(t,"status_blocks","block",ft),zt("show_auto_off")]),Dt(t,"editor_group_control","mdi:gamepad-round-outline",[zt("show_control_tab"),Ln(t,"control_sections","section",gt)]),Dt(t,"editor_group_filament","mdi:printer-3d-nozzle",[zt("show_filament_tab"),Dn(t,"ams_folding","folding",ln)])],computeLabel:e=>e.name in Nr?o(t,Nr[e.name]):void 0,computeHelper:e=>e.name in Fr?o(t,Fr[e.name]):void 0}}var En="bambuddy-printer-card-editor",Ht="ha-form",ls=5e3;async function Wr(t=ls){let e=window.customElements;if(e.get(Ht))return!0;(async()=>{await(await(await window.loadCardHelpers?.())?.createCardElement({type:"button"}))?.constructor?.getConfigElement?.()})().catch(()=>{});let i,r=new Promise(s=>{i=setTimeout(()=>s(!1),t)}),a=await Promise.race([e.whenDefined(Ht).then(()=>!0),r]);return clearTimeout(i),a}var Et=class extends V{constructor(){super(...arguments);this.formReady=window.customElements.get(Ht)!==void 0;this.helper=n=>(n.name==="start_view"?Ur(this.hass,this.shown??{}):void 0)??this.fields().computeHelper(n);this.changed=n=>{let i=n.detail.value,r=Kr(this.config,this.shown,i);this.setConfig(r),this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:r},bubbles:!0,composed:!0}))}}static{this.properties={hass:{attribute:!1},shown:{state:!0},formReady:{state:!0}}}static{this.styles=$e`
    .unavailable {
      margin: 0;
      padding: 8px 0;
      color: var(--secondary-text-color);
    }
  `}setConfig(n){this.shown=Ir(Lt(n)),this.config=n}connectedCallback(){super.connectedCallback(),this.formReady||window.customElements.whenDefined(Ht).then(()=>this.formReady=!0)}fields(){let n=he(this.hass);return this.form?.language!==n&&(this.form={language:n,form:Gr(this.hass)}),this.form.form}render(){if(!this.shown)return p;if(!this.formReady)return c`<p class="unavailable">${o(this.hass,"editor_unavailable")}</p>`;let{schema:n,computeLabel:i}=this.fields();return c`<ha-form
      .hass=${this.hass}
      .data=${this.shown}
      .schema=${n}
      .computeLabel=${i}
      .computeHelper=${this.helper}
      @value-changed=${this.changed}
    ></ha-form>`}};var ds=window.customElements,cs=1e4;function ps(t=()=>window.customElements,e=ds,n=cs){let i=Date.now();return new Promise(r=>{let a=()=>{let s=t();s!==e||s.get("home-assistant")||Date.now()-i>=n?r(s):setTimeout(a,50)};a()})}var us="https://github.com/Spegeli/hacs_bambuddy#-dashboard-card";function hs(t,e,n){let i=t.entities[e];if(!i||i.platform!==dn||!i.device_id)return null;let r=t.devices[i.device_id],a=_t(t,i.device_id)?i.device_id:r?.via_device_id;return!a||!_t(t,a)?null:{config:{type:`custom:${n}`,printer:a}}}function Rn(t,e){ps().then(n=>{n.get(t)||n.define(t,e)})}function Zr(t,e,n){Rn(t,e);let i=window;i.customCards??=[],!i.customCards.some(r=>r.type===t)&&i.customCards.push({type:t,get name(){return n.name()},get description(){return n.description()},preview:!0,documentationURL:us,getEntitySuggestion:(r,a)=>hs(r,a,t)})}function qr(t){let{hass:e,refs:n}=t;return w(e,n.plateClearNeeded)?.state!=="on"||Y.has(t.status)?p:n.plateCleared?t.canControl?we(o(e,"plate_text"),x({label:o(e,"plate_cleared"),iconName:"check",kind:"primary",pending:t.isPending("plate"),onClick:()=>t.run("plate","button","press",{entity_id:n.plateCleared})})):we(o(e,"plate_text_read")):we(o(e,"plate_text_bambuddy"))}var ms=new Set(["idle","printing","unknown","unavailable"]),fs={idle:"ready",preparing:"timer",slicing:"timer",printing:"play",paused:"pause",finished:"check",failed:"error"};function Mn(t,e){let{hass:n,refs:i,status:r}=t,a=w(n,i.stage)?.state;return(e&&!(r==="finished"||r==="failed")&&a&&!ms.has(a)?D(n,i.stage):D(n,i.status,r))??r}function gs(t,e){let{status:n}=t;return c`<div class="state tone-${Yt(n)}">${_(fs[n]??"infoOutline")}<span>${Mn(t,e)}</span></div>`}function Pn(t,e){let n=_n(t);if(n)return c`<div class="job">${e}<div class="job-info">${n.info}</div></div>${n.actions}`;let i=c`<div class="offline-actions">${x({label:o(t.hass,"check_connection"),iconName:"lan",onClick:t.checkConnection})}</div>`;return c`<div class="job">${e}<div class="job-info">${H(bi(t,"offline_text"),"warning")}</div></div>
    ${t.unreachable?p:i}`}function _s(t,e){let{hass:n,refs:i,status:r}=t,a=Yt(r);if(!t.online)return Pn(t,e);let s=Je.has(r),d=s?D(n,i.job):void 0,l=d===void 0?void 0:et(d),u=r==="finished"?100:k(n,i.progress),f=[],m=k(n,i.layer),g=k(n,i.totalLayers);s&&m&&g&&f.push(["layers",o(n,"layer",{current:m,total:g})]);let h=me(n,i.remaining);Y.has(r)&&h&&f.push(["timer",o(n,"remaining",{time:G(n,h)})]);let b=w(n,i.endTime)?.state,y=Y.has(r)&&b?Xe(n,b):void 0;y&&f.push(["clock",o(n,"ends",{time:y})]);let $=s&&r!=="failed"&&u!==void 0,v=pt(t);return c`<div class="job">
    ${e}
    <div class="job-info">
      <div class="job-top">
        <span class="job-name" title=${l??""}>${l??o(n,"no_job")}</span>
        ${$?c`<span class="pct tone-${a}">${M(n,u)}</span>`:p}
      </div>
      ${gs(t,s)}
      ${v?c`<div class="ams-activity" role="status">${_("sync")}<span class="sr-only">${ce(t)}: </span><span>${v}</span></div>`:p}
      ${$?c`<div
            class="bar tone-${a}"
            role="progressbar"
            aria-label=${o(n,"progress")}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow=${u}
          >
            <span style="width: ${Math.max(0,Math.min(100,u))}%"></span>
          </div>`:p}
      ${f.length?c`<div class="meta">${f.map(([F,ee])=>c`<span>${_(F)}${ee}</span>`)}</div>`:p}
    </div>
  </div>`}function bs(t,e,n,i,r=!1){let{hass:a}=t,s=k(a,n.sensor),d=k(a,n.target),l=d!==void 0&&d>oe(a,n.target),u=l&&s!==void 0&&Zt(d,O(a,n.target))-Zt(s,O(a,n.sensor))>3,f=s===void 0?"\u2014":N(a,n.sensor,s),m=d===void 0?void 0:l?o(a,"target",{value:N(a,n.target,d)}):o(a,"heater_off");return c`<button
    class="temp ${u?"heating":""}"
    aria-label=${[r?`${e} ${o(a,"nozzle_active")}`:e,f,m].filter(Boolean).join(", ")}
    @click=${()=>t.moreInfo(t.viewOnly?n.sensor:n.target??n.sensor)}
  >
    <span class="temp-head"
      >${_(u?"heat":i)}<span>${e}</span> ${r?c`<span class="temp-tag">${o(a,"nozzle_active")}</span>`:p}</span
    >
    <span class="temp-value">${f}</span>
    ${m?c`<span class="temp-target">${m}</span>`:p}
  </button>`}function ws(t){let e=ot(t).filter(({heater:i})=>i.sensor||i.target);if(!e.length)return p;let n=t.busy?de(t):void 0;return c`<div class="temps n${e.length} ${t.refs.dual?"dual":""}">
    ${e.map(({label:i,heater:r,kind:a,index:s})=>bs(t,i,r,a,a==="nozzle"&&s===n))}
  </div>`}function ys(t,e){let n=w(t.hass,e);if(!n||n.state!=="on"&&n.state!=="off")return;let i=n.attributes.percentage;return n.state==="off"?0:typeof i=="number"?i:100}function vs(t){let{hass:e,refs:n}=t,i=n.fans.filter(r=>w(e,r.entityId)?.attributes.restored!==!0).map(r=>[r.key,r.entityId,ys(t,r.entityId)]);return n.hotendFan&&i.push(["hotend",n.hotendFan,k(e,n.hotendFan)]),i.length?c`<div class="fans" role="group" aria-label=${o(e,"fans")}>
    ${i.map(([r,a,s])=>{let d=o(e,`fan_${r}`),l=lt(t,a,`fan_${r}_name`),u=s===void 0?"\u2014":s>0?M(e,s):o(e,"fan_off"),f=c`${_("fan")}<span class="fan-label short">${d}</span><span class="fan-label full">${l}</span><span class="fan-value">${u}</span>`;return t.viewOnly&&r!=="hotend"?c`<span class="fan ${s?"on":""}" role="img" aria-label="${l}: ${u}" title=${l}>${f}</span>`:c`<button class="fan ${s?"on":""}" aria-label="${l}: ${u}" title=${l} @click=${()=>t.moreInfo(a)}>
            ${f}
          </button>`})}
  </div>`:p}var xs=(t,e)=>t.unknown?"\u2014":t.empty?t.present&&!e?"?":"\u2013":t.type||"?";function ks(t){let{hass:e,refs:n}=t,i=n.externalSpools.length===2,r=[...t.ams.map(h=>{let b=dt(t.ams,h),y=ct(e,h),$=[b,y?o(e,y==="left"?"strip_nozzle_left":"strip_nozzle_right"):void 0].filter(Boolean);return{name:h.name,spoken:$.length?`${h.name} (${$.join(", ")})`:h.name,model:b,nozzle:y,humidity:k(e,h.humidity),temperature:k(e,h.temperature),temperatureUnit:O(e,h.temperature),slots:h.slots,fill:h.model===se,ht:h.model===se,sides:!1}}),...n.externalSpools.length?[{name:o(e,"external_short"),spoken:o(e,i?"externals":"external"),model:void 0,nozzle:void 0,humidity:void 0,temperature:void 0,slots:n.externalSpools,fill:!0,ht:!1,sides:i}]:[]];if(!r.length)return p;let a=r.filter(h=>!h.fill),s=r.filter(h=>h.fill),d=i?[o(e,"side_left_short"),o(e,"side_right_short")]:[],l=h=>d[n.externalSpools.indexOf(h)],u=h=>{let b=B(e,h),y=i?n.externalSpools.indexOf(h):-1;return`${y>=0?`${ye(e,y)}: `:""}${ht(e,b)}${b.active?` \xB7 ${o(e,"in_use")}`:""}`},f=[...a,...s].map(h=>o(e,"strip_unit",{name:[h.spoken,...h.humidity===void 0?[]:[o(e,"strip_humidity",{humidity:M(e,h.humidity)})],...h.temperature===void 0?[]:[o(e,"strip_temperature",{temperature:L(e,h.temperature,h.temperatureUnit)})]].join(", "),slots:h.slots.map(u).join(", ")})),m=h=>c`<span class="ams-group">
        <span class="ams-head">
          <span class="ams-line">
            <span class="ams-name" title=${h.spoken}>${h.name}</span>
            ${h.model?c`<span class="unit-model">${h.model}</span>`:p}
            ${h.nozzle?c`<span class="ams-nozzle" aria-hidden="true" title=${o(e,h.nozzle==="left"?"nozzle_left":"nozzle_right")}
                  >${o(e,h.nozzle==="left"?"side_left_short":"side_right_short")}</span
                >`:p}
          </span>
          ${h.sides?p:c`<span class="ams-env">
                ${h.humidity!==void 0?c`<span class="ams-hum">${_("humidity")}${M(e,h.humidity)}</span>`:p}
                ${h.temperature!==void 0?c`<span class="ams-temp">${_("chamber")}${L(e,h.temperature,h.temperatureUnit)}</span>`:p}
              </span>`}
        </span>
        <span class="ams-slots">
          ${h.slots.map(b=>{let y=B(e,b),$=l(b);return c`<span class="ams-slot" title=${$?`${$} \xB7 ${ht(e,y)}`:ht(e,y)}
              >${$?c`<span class="slot-side">${$}</span>`:p}${Ee(y)}<span class="slot-type"
                >${xs(y,n.externalSpools.includes(b))}</span
              ></span
            >`})}
        </span>
      </span>`,g=c`${a.length?c`<span class="ams-column" aria-hidden="true">${a.map(m)}</span>`:p}${s.length?c`<span class="ams-fill ${s.some(h=>h.ht)?"with-ht":""}" aria-hidden="true">${s.map(m)}</span>`:p}`;return t.filamentTab?c`<button class="ams-strip" aria-label=${`${o(e,"block_ams")} \u2013 ${o(e,"open_filament")}`} aria-describedby="ams-said" @click=${()=>t.show("filament")}>
        <span class="sr-only" id="ams-said">${f.join(". ")}</span>${g}<span class="ams-go">${_("chevronRight")}</span>
      </button>`:c`<div class="ams-strip" role="group" aria-label=${o(e,"block_ams")}><span class="sr-only">${f.join(". ")}</span>${g}</div>`}var $s=["silent","standard","sport","ludicrous"];function Cs(t){let e=/^(.+?)\s*\(([^)]+)\)\s*$/.exec(t);return e?[e[1],e[2]]:[t]}function Ss(t){let{hass:e,refs:n,status:i}=t,r=w(e,n.speed);if(!r||!t.online||!Y.has(i))return p;if(!t.canControl)return c`<div class="speed">
      <span class="speed-label">${_("speed")}${o(e,"speed")}</span>
      <span class="speed-now">${D(e,n.speed,r.state)??r.state}</span>
    </div>`;let a=ge(r,$s,!0),s=t.isPending("speed"),d=X(a,r.state);return c`<div class="speed">
    <span class="speed-label">${_("speed")}${o(e,"speed")}</span>
    <div class="seg speeds" role="radiogroup" aria-label=${o(e,"speed")} @keydown=${W} @focusout=${Z}>
      ${a.map((l,u)=>{let f=D(e,n.speed,l),[m,g]=Cs(f);return c`<button
          role="radio"
          aria-checked=${l===r.state?"true":"false"}
          tabindex=${u===d?0:-1}
          aria-label=${f}
          title=${f}
          aria-disabled=${s?"true":p}
          ?disabled=${r.state==="unavailable"}
          @click=${()=>t.run("speed","select","select_option",{entity_id:n.speed,option:l})}
        >
          <span class="opt">${m}</span> ${g?c`<span class="opt-sub">${g}</span>`:p}
        </button>`})}
    </div>
  </div>`}function Ts(t){let{hass:e,refs:n}=t;return n.dual||w(e,n.activeFilament)?.state!=="none"?!1:![...t.ams.flatMap(r=>r.slots),...n.externalSpools].some(r=>B(e,r).active)}function Yr(t){let{hass:e,refs:n,status:i}=t;if(!t.online||!Y.has(i))return p;if(!t.canControl)return p;let r=i==="paused",a=[r?n.resume?at(t):p:n.pause?x({label:o(e,"pause"),iconName:"pause",pending:t.isPending("pause"),onClick:()=>t.run("pause","button","press",{entity_id:n.pause})}):p,n.stop?x({label:o(e,"stop"),iconName:"stop",kind:"danger",pending:t.isPending("stop"),onClick:()=>t.confirm(tt(e,["button","press",{entity_id:n.stop}],"stop"))}):p,i==="printing"||r?x({label:o(e,"skip"),iconName:"skip",kind:"plain",pending:t.isPending("skip"),className:"skip",onClick:t.skip}):p],s=r&&n.resume?t.changing?H(o(e,"changing_paused")):Ts(t)?H(o(e,t.filamentTab?"paused_empty":"paused_empty_no_tab"),"warning"):p:p;return c`<div class="controls">${s}<div class="ctl-buttons">${a}</div></div>`}function Rt(t,e){return e==="controls"?c`${le(t)}${Yr(t)}`:e==="power"?t.unreachable?p:cr(t):t.online?e==="temperatures"?ws(t):e==="fans"?vs(t):e==="ams"?ks(t):Ss(t):p}var As=(t,e)=>e==="power"?Rt(t,e)!==p:t.online&&(e==="controls"||e==="speed"?t.busy:!0);function zs(t){let e={...Le(t),status:"printing",busy:!0,running:!0,changing:!1},n=[],i,r=[],a=()=>{i&&n.push(it(t,i,r)),i=void 0,r=[]};for(let s of t.settings.blocks){if(As(t,s)){a(),n.push(Rt(t,s));continue}let d=s==="controls"?le(t):p;d!==p&&(a(),n.push(d));let l=s==="controls"?Yr(e):Rt(e,s);if(l===p)continue;let u=nt(t,s==="controls"||s==="speed");u!==i&&a(),i=u,r.push(l)}return a(),n}function Xr(t,e){let n=t.online;return c`${n?qr(t):p}${_s(t,e)}${n?p:qr(t)}
  ${t.examples?zs(t):t.settings.blocks.map(i=>Rt(t,i))}`}var Jr=$e`
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
    --bb-divider: var(--divider-color, rgba(0, 0, 0, 0.12));
    --bb-tint: rgba(var(--rgb-primary-text-color, 33, 33, 33), 0.05);
    --bb-tint-2: rgba(var(--rgb-primary-text-color, 33, 33, 33), 0.09);
    --bb-line: rgba(var(--rgb-primary-text-color, 33, 33, 33), 0.16);
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
  /* The airduct mode: last in the heating section. */
  .airduct {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 10px;
    border-top: 1px solid var(--bb-divider);
  }
  .airduct .hint {
    margin: 0;
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
  button.picture {
    cursor: pointer;
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
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
  }
  .live-hint .icon {
    width: 16px;
    height: 16px;
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
  .job-top {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .job-name {
    flex: 1;
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
    background: rgba(0, 0, 0, 0.55);
  }
  .fps-restart {
    margin-top: 8px;
  }
  .live-tools {
    position: absolute;
    top: 6px;
    right: 6px;
    display: flex;
    gap: 6px;
  }
  .live .icon-btn {
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
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
    flex-wrap: wrap;
    align-items: stretch;
    gap: 8px 16px;
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
  .ams-column {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ams-fill {
    display: flex;
    flex: 1 1 0%;
    min-width: min-content;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 8px 16px;
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
  .ams-name {
    font-weight: 500;
    color: var(--bb-text);
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
    box-shadow: inset 0 0 0 1px rgba(var(--rgb-primary-text-color, 33, 33, 33), 0.24);
    pointer-events: none;
  }
  .swatch.outline::after {
    box-shadow: inset 0 0 0 1px rgba(var(--rgb-primary-text-color, 33, 33, 33), 0.5);
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
    box-shadow: 0 -1px 0 rgba(var(--rgb-primary-text-color, 33, 33, 33), 0.4);
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
  .heat-head .btn {
    min-height: 32px;
    font-size: 13px;
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
  .heat-set {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  /* The steppers and the heater's off button. */
  .heat-row .btn.icon-only {
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
    max-width: min(360px, calc(100vw - 32px));
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
  .rfid-spool {
    font-weight: 500;
  }
  .k-hint {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    line-height: 16px;
    color: var(--bb-muted);
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
    box-shadow: inset 0 0 0 1px rgba(var(--rgb-primary-text-color, 33, 33, 33), 0.24);
    pointer-events: none;
  }
  .pal.outline::after {
    box-shadow: inset 0 0 0 1px rgba(var(--rgb-primary-text-color, 33, 33, 33), 0.5);
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
    .live {
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
      right: 8px;
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
`;var Ds="bambuddy-printer-card",Ls={status:"infoOutline",control:"tune",filament:"palette"},Hs="hui-dialog-edit-card";function Es(t){for(let e=t;e;e=e instanceof ShadowRoot?e.host:e.parentNode)if(e instanceof Element&&e.localName===Hs)return!0;return!1}var Rs=["offline","unavailable","unknown"],Ms={controls:1,power:2,temperatures:2,ams:2,fans:1,speed:1},Qr="bb-view",Ps=12e3,ea=3e3,ta=800,na=1e4,Mt=(t,e,n)=>Math.min(n,Math.max(e,t)),Os=15e3,ia=8,Bs=[".stepper",".heat-set",".heat-row",".heating"],On=class extends V{constructor(){super(...arguments);this.preview=!1;this.view="status";this.liveWanted=!1;this.pageVisible=document.visibilityState!=="hidden";this.streamFailed=!1;this.pending=new Set;this.sent=!1;this.menuOpen=!1;this.step=1;this.drafts=new Map;this.optionsOpen=!1;this.amsOpen=new Map;this.settings=S;this.streamRun=0;this.keyedAt=0;this.draftTimers=new Map;this.attached=!1;this.inEditor=!1;this.dialogFromMenu=!1;this.dialogBack=void 0;this.asker=void 0;this.onVisibility=()=>{this.pageVisible=document.visibilityState!=="hidden",this.pageVisible||this.stopStream()};this.onPointerDown=n=>{if(!this.menuOpen)return;let i=this.renderRoot.querySelector(".menu-wrap");i&&!n.composedPath().includes(i)&&(this.menuOpen=!1)};this.restartLive=()=>{this.stopStream(),this.streamRun+=1,this.requestUpdate()};this.startLive=()=>{this.streamFailed=!1,this.liveWanted=!0,this.focusAfterUpdate(".live .live-close")};this.closeLive=()=>{this.stopStream(),this.liveWanted=!1,this.streamFailed=!1,this.focusAfterUpdate("button.picture",".btn.live-btn",'.tabs [aria-selected="true"]')};this.streamBroke=()=>{this.stopStream(),this.streamFailed=!0};this.setStep=n=>{this.step=n};this.retryLive=()=>{this.streamFailed=!1};this.closeError=()=>{clearTimeout(this.errorTimer),this.error=void 0};this.closeDialog=()=>{let n=this.dialogBack;if(this.dialogBack=void 0,n&&this.dialog&&this.dialog!==n){this.dialog=n;let a=this.asker;this.asker=void 0,this.focusAfterUpdate(...a?[a]:[],"dialog .btn.safe");return}let i=this.dialogFromMenu;this.stopCheckTimer(),this.dialog=void 0,this.dialogFromMenu=!1;let r=this.renderRoot.querySelector("dialog");r?.open&&r.close(),i&&this.focusMenuButton()};this.confirmDialog=()=>{let n=this.dialog;if(n?.kind==="check"){this.runCheck();return}if((this.dialogBack?.kind==="filament"||this.dialogBack?.kind==="hms")&&(this.dialogBack=void 0),this.closeDialog(),!!n)if(n.kind==="confirm"){let[i,r,a]=n.action;this.run(n.key,i,r,a)}else n.kind==="hms"?this.run("clear_hms","button","press",{entity_id:this.refs?.clearHms}):n.kind==="skip"?this.run("skip","bambuddy","skip_objects",{device_id:this.refs?.deviceId,objects:n.chosen}):n.kind==="filament"?this.run(`filament_${n.entityId}`,"bambuddy","set_filament",{entity_id:n.entityId,...Cn(n)}):n.kind==="drying"&&this.run(`dry_${n.unit.deviceId}`,"bambuddy","start_drying",{device_id:n.unit.deviceId,temperature:n.temperature,duration:n.duration})};this.dialogActions={close:this.closeDialog,confirm:this.confirmDialog,restartLive:this.restartLive,setDrying:(n,i)=>this.setDrying(n,i),toggleObject:n=>this.toggleObject(n),setMaterial:n=>{let i={...this.dialog,material:n};this.editFilament({material:n,kprofile:n===Q?void 0:Sn(i)})},setKProfile:n=>this.editFilament({kprofile:n}),resetSlot:()=>this.resetSlot(),refreshRfid:()=>this.refreshRfid(),setColor:n=>this.editFilament({color:n}),pickColor:n=>this.pickColor(n),copy:n=>{this.copy(n)},confirmTask:n=>this.confirmTask(n),cancel:n=>{if(this.dialogBack){n.preventDefault(),this.closeDialog();return}this.dialog?.kind!=="maintenance"||this.dialog.confirming===void 0||(n.preventDefault(),this.confirmTask(void 0))},markDone:(n,i)=>{this.markDone(n,i)},toggleFold:n=>{let i=this.dialog;if(i?.kind!=="check")return;let r=i.open??[];this.dialog={...i,open:r.includes(n)?r.filter(a=>a!==n):[...r,n]}},now:()=>Date.now()};this.toggleMenu=()=>{this.menuOpen=!this.menuOpen};this.triggerKeys=n=>{n.key==="ArrowDown"&&(n.preventDefault(),this.menuOpen=!0)};this.menuKeys=n=>{if(n.key==="Escape"){n.preventDefault(),n.stopPropagation(),this.closeMenu(!0);return}if(n.key==="Tab"){this.menuOpen=!1;return}let i=this.menuItems().filter(s=>!s.disabled),r=i.indexOf(this.renderRoot.activeElement),a={ArrowDown:r+1,ArrowUp:r-1,Home:0,End:i.length-1};n.key in a&&(n.preventDefault(),i[(a[n.key]+i.length)%i.length]?.focus())}}static{this.properties={hass:{attribute:!1},preview:{type:Boolean},config:{state:!0},view:{state:!0},liveWanted:{state:!0},pageVisible:{state:!0},streamFailed:{state:!0},brokenCover:{state:!0},pending:{state:!0},error:{state:!0},sent:{state:!0},dialog:{state:!0},menuOpen:{state:!0},step:{state:!0},drafts:{state:!0},optionsOpen:{state:!0},amsOpen:{state:!0}}}static{this.styles=Jr}parkDialog(n){this.dialogBack=this.dialog,n?this.asker=n:this.rememberAsker(),this.focusAfterUpdate("dialog .btn.safe")}rememberAsker(){let n=this.renderRoot.activeElement,i=n?.getAttribute("data-answer"),r=n?.getAttribute("aria-label"),a=s=>s.replace(/["\\]/g,"\\$&");this.asker=i?`dialog [data-answer="${a(i)}"]`:r?`dialog [aria-label="${a(r)}"]`:void 0}static async getConfigElement(){return await Wr(),document.createElement(En)}static getStubConfig(n){let i=n?Ni(n):[],a=i.find(s=>n&&!Rs.includes(Bi(n,s.id)??"unavailable"))??i[0];return a?{printer:a.id}:{}}setConfig(n){this.config=Lt(n),this.settings=Vr(this.config),this.view=this.settings.startView,this.amsOpen=new Map,this.liveWanted=!1,this.refs=void 0,this.streamSrc!==void 0&&this.stopStream(),this.streamFailed=!1,this.dialog=void 0,this.dialogFromMenu=!1,this.dialogBack=void 0}getCardSize(){let n=this.hass,i=n?fn(n,this.refs?.plugs??[]):[];return this.settings.blocks.reduce((r,a)=>r+(a==="power"&&!i.length?0:Ms[a]),4)}getGridOptions(){return{columns:12,min_columns:6,rows:"auto"}}connectedCallback(){super.connectedCallback(),this.attached=!0,this.inEditor=Es(this),this.dialog?.kind==="check"&&this.dialog.running&&this.startCheckTimer(),document.addEventListener("visibilitychange",this.onVisibility),document.addEventListener("pointerdown",this.onPointerDown),this.requestUpdate()}disconnectedCallback(){this.attached=!1,document.removeEventListener("visibilitychange",this.onVisibility),document.removeEventListener("pointerdown",this.onPointerDown),this.menuOpen=!1,this.stopStream(),this.liveWanted=!1,clearTimeout(this.errorTimer),this.followStarting(!1),this.error=void 0,clearTimeout(this.sentTimer),this.sent=!1,clearTimeout(this.copiedTimer),this.stopCheckTimer(),this.dialog?.kind==="info"&&(this.dialog={kind:"info"});for(let[n,i]of this.drafts)i.sentFrom===void 0&&this.sendTarget(n);this.renderRoot.querySelector("dialog")?.removeAttribute("open"),super.disconnectedCallback()}shouldUpdate(n){if(n.size!==1||!n.has("hass"))return!0;let i=n.get("hass"),r=this.hass;return!i||!r||!this.refs||i.entities!==r.entities||i.devices!==r.devices||i.locale!==r.locale||i.localize!==r.localize||i.formatEntityState!==r.formatEntityState||i.config!==r.config||i.user!==r.user?!0:this.refs.watched.some(a=>i.states[a]!==r.states[a])}willUpdate(n){let i=this.hass;if(!(!i||!this.config)){if(li(i),(!this.refs||n.has("config")||i.entities!==this.seenEntities||i.devices!==this.seenDevices)&&(this.seenEntities=i.entities,this.seenDevices=i.devices,this.refs=Ii(i,this.config.printer)),!this.streaming())this.streamSrc&&this.stopStream();else{let r=this.frameRate();this.streamSrc&&r!==void 0&&r!==this.streamFps&&this.stopStream(),this.streamSrc||(this.streamFps=r,this.streamSrc=this.streamUrl())}for(let[r,a]of this.drafts){let s=i.states[r]?.state;a.wish&&(a.moved||=s!==a.sentFrom),(a.wish?s!=="on"&&s!=="off"||s===a.wish&&a.moved===!0:a.sentFrom!==void 0&&s!==a.sentFrom)&&this.dropDraft(r)}}}followStarting(n){n&&!this.startingTimer&&(this.startingTimer=setInterval(()=>this.requestUpdate(),1e3)),!n&&this.startingTimer&&(clearInterval(this.startingTimer),this.startingTimer=void 0)}firstUpdated(n){super.firstUpdated(n),this.renderRoot.addEventListener("focusin",i=>{let r=i.composedPath()[0];this.focusedLast=r instanceof HTMLElement?r:void 0}),this.renderRoot.addEventListener("keydown",()=>{this.keyedAt=Date.now()})}updated(n){super.updated(n),this.keepKeyboardPlace(),n.has("menuOpen")&&this.menuOpen&&(this.placeMenu(),this.menuItems()[0]?.focus());let i=this.renderRoot.querySelector("dialog");i&&!i.open&&this.isConnected&&(typeof i.showModal=="function"?i.showModal():i.setAttribute("open",""),i.querySelector(".dlg-actions .safe")?.focus());let r=i?.open?i.querySelector(".dlg-actions"):null;i&&r&&(i.style.scrollPaddingBottom=`${r.offsetHeight+12}px`)}keepKeyboardPlace(){if(!this.isConnected)return;let n=this.focusedLast;if(!n||Date.now()-this.keyedAt>Os)return;let i=this.renderRoot.activeElement;if(i&&i!==n)return;let r=document.activeElement;if(!i&&r!==null&&r!==document.body&&r!==this)return;if(n.isConnected&&!n.disabled){!i&&this.renderRoot.querySelector("dialog[open]")&&n.focus();return}this.focusedLast=void 0;let a="button:not([disabled]), input:not([disabled])",s=n.isConnected?Bs.map(l=>n.closest(l)?.querySelector(a)).find(Boolean):void 0,d=this.renderRoot.querySelector("dialog[open] .dlg-actions .safe");(s??d??this.renderRoot.querySelector('.tabs [aria-selected="true"]')??this.renderRoot.querySelector(".menu-btn"))?.focus()}placeMenu(){let n=this.renderRoot.querySelector(".menu");if(!n)return;n.style.translate="";let i=n.getBoundingClientRect();if(!i.width)return;let r=Math.max(ia-i.left,0)+Math.min(window.innerWidth-ia-i.right,0);n.style.translate=r?`${r}px 0`:""}cameraToken(){let n=this.refs?.camera;if(!(!this.hass||!n||!z(this.hass,n)))return fe(w(this.hass,n)?.attributes.access_token)}streaming(){return this.settings.camera==="off"||this.preview||!this.attached||!this.pageVisible||this.streamFailed||!this.refs||!this.cameraToken()?!1:this.settings.camera==="always"||this.liveWanted}frameRate(n=!1){let i=this.refs?.camera?w(this.hass,this.refs.camera)?.attributes[n?"streamed_frame_rate":"frame_rate"]:void 0;return typeof i=="number"?i:void 0}streamUrl(){let n=this.streamFps===void 0?"":`&fps=${this.streamFps}`,i=this.streamRun?`&run=${this.streamRun}`:"";return`/api/camera_proxy_stream/${this.refs?.camera}?token=${encodeURIComponent(this.cameraToken()??"")}${n}${i}`}stopStream(){for(let n of this.renderRoot.querySelectorAll("img.stream"))n.removeAttribute("src");this.streamSrc=void 0}canStartLive(n){return this.settings.camera==="tap"&&n&&!this.preview&&!this.liveWanted&&this.cameraToken()!==void 0}focusAfterUpdate(...n){this.updateComplete.then(()=>{for(let i of n){let r=this.renderRoot.querySelector(i);if(r)return r.focus()}})}async run(n,i,r,a){let s=this.hass;if(!s||this.pending.has(n))return!1;let d=this.renderRoot.activeElement;this.pending=new Set([...this.pending,n]),d&&this.dialog&&this.updateComplete.then(()=>{d.disabled&&this.renderRoot.querySelector("dialog .btn.safe")?.focus()});try{return await Wt(s,i,r,a),this.showSent(),n.startsWith("hms_")&&this.dialog?.kind==="hms"&&this.closeDialog(),!0}catch(l){return this.showError(await De(s,l)),!1}finally{this.pending=new Set([...this.pending].filter(l=>l!==n))}}targetOf(n){return this.drafts.get(n)?.value??k(this.hass,n)}setDraft(n,i){this.drafts=new Map([...this.drafts,[n,i]])}dropDraft(n){clearTimeout(this.draftTimers.get(n)),this.draftTimers.delete(n);let i=new Map(this.drafts);i.delete(n),this.drafts=i}later(n,i,r){clearTimeout(this.draftTimers.get(n)),this.draftTimers.set(n,setTimeout(r,i))}stepTarget(n,i){this.setDraft(n,{value:i}),this.later(n,ta,()=>{this.sendTarget(n)})}async sendTarget(n){let i=this.hass,r=this.drafts.get(n),a=`target_${n}`;if(this.pending.has(a)){this.later(n,ta,()=>{this.sendTarget(n)});return}this.setDraft(n,{value:r.value,sentFrom:i.states[n]?.state??""}),this.later(n,na,()=>this.dropDraft(n)),!await this.run(a,"number","set_value",{entity_id:n,value:r.value})&&this.drafts.get(n)?.sentFrom!==void 0&&this.dropDraft(n)}switchOn(n){let i=this.drafts.get(n);return i?i.value===1:w(this.hass,n).state==="on"}async toggleSwitch(n,i="switch",r=`switch_${n}`){if(this.pending.has(r))return;let a=!this.switchOn(n),s=w(this.hass,n).state;this.setDraft(n,{value:a?1:0,sentFrom:s,wish:a?"on":"off"}),this.later(n,na,()=>this.dropDraft(n)),await this.run(r,i,a?"turn_on":"turn_off",{entity_id:n})||this.dropDraft(n)}setTargets(n){for(let[i,r]of n)this.setDraft(i,{value:r}),this.sendTarget(i)}showError(n){this.error=n,clearTimeout(this.errorTimer),this.errorTimer=setTimeout(()=>{this.error=void 0},Ps)}showSent(){this.closeError(),this.sent=!0,clearTimeout(this.sentTimer),this.sentTimer=setTimeout(()=>{this.sent=!1},ea)}dropSent(){clearTimeout(this.sentTimer),this.sent=!1}moreInfo(n){n&&this.dispatchEvent(new CustomEvent("hass-more-info",{bubbles:!0,composed:!0,detail:{entityId:n}}))}openDrying(n){let i=this.hass,r=n.model==="AMS 2 Pro"?E.maxTemperatureAms2Pro:E.maxTemperature,a=n.slots.map(m=>B(i,m)).filter(m=>!m.empty&&!m.unknown),s=(m,g)=>{let h=w(i,m.entityId).attributes[g];return typeof h=="number"&&h>0?Math.round(h):void 0},d=new Map;for(let m of a){let g=s(m,"drying_temp"),h=m.type||m.name;g!==void 0&&d.set(`${h} ${g}`,{material:h,temperature:g})}let l=[...d.values()].sort((m,g)=>m.temperature-g.temperature),u=l.map(m=>m.temperature),f=a.map(m=>s(m,"drying_time")).filter(m=>m!==void 0);this.dialog={kind:"drying",unit:n,temperature:Mt(u[0]??E.temperature,E.minTemperature,r),duration:Mt(f.length?Math.max(...f):E.duration,E.minDuration,E.maxDuration),maxTemperature:r,suggested:u.length>0||f.length>0,...l.length?{suggestedFor:[...new Set(l.map(m=>m.material))].join(", ")}:{},differing:new Set(u).size>1?l:[]}}async openSkip(){let n=this.hass,i=this.refs.deviceId,r={kind:"skip",loading:!0,objects:[],chosen:[]};this.dialog=r;let a;try{a={...r,loading:!1,objects:await ci(n,i)}}catch(s){let d=await De(n,s);a={...r,loading:!1,error:d}}this.dialog===r&&(this.dialog=a)}toggleObject(n){let i=this.dialog;if(i?.kind!=="skip")return;let r=i.chosen.includes(n)?i.chosen.filter(s=>s!==n):[...i.chosen,n],a=i.objects.map(s=>s.id);this.dialog={...i,chosen:r.sort((s,d)=>a.indexOf(s)-a.indexOf(d))}}openFilament(n,i){let r=this.hass,a=this.refs,s=n.type?n.name:void 0,d=n.color?.toUpperCase(),l={kind:"filament",entityId:n.entityId,title:i,...s?{keep:s,material:Q}:{},...d?{current:d,color:d,...$n(d)?{}:{custom:d}}:{},rfid:n.rfid,...n.empty?{empty:!0}:{},ams:!a.externalSpools.includes(n.entityId),active:n.active,...n.rfid?{spool:[n.name,n.remaining===void 0?"":M(r,n.remaining)].filter(Boolean).join(" \xB7 ")}:{},type:n.type,...n.rfid?{}:{kprofiles:"loading"}};this.dialog=l,n.rfid||this.loadKProfiles(n.entityId)}async loadKProfiles(n){let i;try{i=await di(this.hass,n)}catch{i="failed"}let r=d=>{let l={...d,kprofiles:i};return d.material!==void 0&&d.material!==Q&&d.kprofile===void 0?{...l,kprofile:Sn(l)}:l},a=this.dialog;a?.kind==="filament"&&a.entityId===n&&(this.dialog=r(a));let s=this.dialogBack;s?.kind==="filament"&&s.entityId===n&&(this.dialogBack=r(s))}resetSlot(){let n=this.dialog;if(n?.kind!=="filament")return;let i=this.hass;this.parkDialog(),this.dropSent();let r=w(i,this.refs.status)?.state,a=!n.ams,s=o(i,a?"reset_text_spool":"reset_text"),d=o(i,a?"reset_in_use_spool":"reset_in_use");this.dialog={kind:"confirm",title:o(i,a?"reset_title_spool":"reset_title"),text:n.active&&r==="paused"?`${s} ${d}`:s,confirm:o(i,"reset_confirm"),danger:!0,action:["bambuddy","reset_slot",{entity_id:n.entityId}],key:`reset_${n.entityId}`}}refreshRfid(){let n=this.dialog;n?.kind==="filament"&&(this.closeDialog(),this.run(`rfid_${n.entityId}`,"bambuddy","refresh_rfid",{entity_id:n.entityId}))}editFilament(n){this.dialog={...this.dialog,...n}}pickColor(n){let i=n.toUpperCase();this.editFilament({color:i,...$n(i)?{}:{custom:i}})}async copy(n){try{await navigator.clipboard.writeText(n)}catch{return}this.dialog?.kind==="info"&&(this.dialog={...this.dialog,copied:!0},clearTimeout(this.copiedTimer),this.copiedTimer=setTimeout(()=>{this.dialog?.kind==="info"&&(this.dialog={kind:"info"})},ea))}setDrying(n,i){let r=this.dialog;if(!Number.isFinite(i))return r[n];let a=n==="temperature"?Mt(Math.round(i),E.minTemperature,r.maxTemperature):Mt(Math.round(i),E.minDuration,E.maxDuration);return this.dialog={...r,[n]:a},a}confirmTask(n){let i=this.dialog;if(i?.kind!=="maintenance")return;let r=i.marking!==void 0?{marking:i.marking}:{};this.dialog=n===void 0?{kind:"maintenance",...r}:{kind:"maintenance",...r,confirming:n},n!==void 0?(this.dropSent(),this.focusAfterUpdate(".maint-confirm .btn.plain")):i.confirming!==void 0&&this.focusAfterUpdate(`.maint-done[data-task="${i.confirming}"]`)}async markDone(n,i){let r=this.hass,a=this.dialog?.kind==="maintenance"?this.dialog.marking??[]:[];this.dialog={kind:"maintenance",marking:[...a,n]};let s;try{await Wt(r,"bambuddy","mark_maintenance_done",{device_id:this.refs?.deviceId,task_id:n})}catch(f){s=await De(r,f)}if(this.dialog?.kind!=="maintenance"||!this.dialog.marking?.includes(n))return;let d=this.dialog.confirming,l=this.dialog.marking.filter(f=>f!==n),u=s??this.dialog.error;this.dialog={kind:"maintenance",...l.length?{marking:l}:{},...d===void 0?{}:{confirming:d},...u===void 0?{}:{error:u},...s===void 0?{marked:i}:{}},d===void 0&&this.focusAfterUpdate(`.maint-done[data-task="${n}"]`,"dialog .btn.safe")}async runCheck(){let n=this.hass,i=this.refs.deviceId,r={kind:"check",running:!0,started:Date.now()};this.dialog=r,this.startCheckTimer(),this.focusAfterUpdate("dialog .btn.safe");let a;try{a={...r,running:!1,result:await Ti(n,i)}}catch(s){a={...r,running:!1,error:await De(n,s)}}this.dialog===r&&(this.stopCheckTimer(),this.dialog=a)}startCheckTimer(){this.stopCheckTimer(),this.checkTimer=setInterval(()=>this.requestUpdate(),1e3)}stopCheckTimer(){clearInterval(this.checkTimer),this.checkTimer=void 0}menuItems(){return[...this.renderRoot.querySelectorAll(".menu [role=menuitem]")]}focusMenuButton(){this.focusAfterUpdate(".menu-btn")}closeMenu(n){this.menuOpen=!1,n&&this.focusMenuButton()}editDevice(n){history.pushState(null,"",`/config/devices/device/${n}`),window.dispatchEvent(new CustomEvent("location-changed",{detail:{replace:!1}}))}menu(n){let{hass:i,refs:r}=n,a=(d,l,u,f=!1,m=!1)=>c`<button
        role="menuitem"
        tabindex="-1"
        aria-haspopup=${m?"dialog":p}
        ?disabled=${f}
        @click=${()=>{this.closeMenu(!m),m&&(this.dialogFromMenu=!0),u()}}
      >
        ${_(d)}<span>${o(i,l)}</span>
      </button>`,s=r.refresh;return c`<span class="menu-wrap">
      <button
        class="icon-btn menu-btn"
        aria-label=${o(i,"more")}
        title=${o(i,"more")}
        aria-haspopup="menu"
        aria-expanded=${this.menuOpen?"true":"false"}
        aria-controls="bb-menu"
        @click=${this.toggleMenu}
        @keydown=${this.triggerKeys}
      >
        ${_("dotsVertical")}
      </button>
      ${this.menuOpen?c`<div class="menu" id="bb-menu" role="menu" aria-label=${o(i,"more")} @keydown=${this.menuKeys}>
            ${i.user?.is_admin?a("openInNew","menu_device_page",()=>this.editDevice(r.deviceId)):p}
            ${a("infoOutline","menu_info",()=>{this.dialog={kind:"info"}},!1,!0)}
            ${yt(n)?a("wrench","menu_maintenance",()=>{this.dialog={kind:"maintenance"}},!1,!0):p}
            ${s?a("refresh","menu_refresh",()=>{this.run("refresh","button","press",{entity_id:s})},w(i,s)?.state==="unavailable"||this.pending.has("refresh")):p}
            ${a("lan","check_connection",()=>{this.runCheck()},n.unreachable,!0)}
          </div>`:p}
    </span>`}context(n,i){let r=pn(n,i),a=w(n,i.status)?.state??"unknown",s=r?a:"offline",d=a==="unavailable",l=Ki(i),u=this.settings,f=l&&!u.readOnly,m=Ui(n,i),g=m.length;return{hass:n,settings:u,refs:i,ams:m,status:s,online:r,unreachable:d,busy:Y.has(s),running:mi.has(s),changing:r&&fi.has(w(n,i.amsStatus)?.state??""),canControl:f,viewOnly:u.readOnly&&l,examples:this.preview&&this.inEditor,controlTab:u.controlTab&&l&&u.sections.some(h=>Ci(i,h,u.readOnly)),filamentTab:u.filamentTab&&(g>0||i.externalSpools.length>0),...this.canStartLive(r)?{startLive:this.startLive}:{},isPending:h=>this.pending.has(h),run:(h,b,y,$)=>{this.run(h,b,y,$)},confirm:h=>{this.dialog?.kind==="power"||this.dialog?.kind==="hms"?this.parkDialog():this.dialogBack=void 0,this.dropSent(),this.dialog={kind:"confirm",...h}},dry:h=>this.openDrying(h),setFilament:(h,b)=>this.openFilament(h,b),skip:()=>{this.openSkip()},targetOf:h=>this.targetOf(h),stepTarget:(h,b)=>this.stepTarget(h,b),setTargets:h=>this.setTargets(h),switchOn:h=>this.switchOn(h),toggleSwitch:h=>{this.toggleSwitch(h)},optionsOpen:this.optionsOpen,toggleOptions:()=>{this.optionsOpen=!this.optionsOpen},amsUnfolded:h=>this.amsOpen.get(h.deviceId)??(u.amsFolding==="open"||u.amsFolding==="auto"&&g<3),toggleAms:(h,b)=>{this.amsOpen=new Map(this.amsOpen).set(h.deviceId,b)},moreInfo:h=>this.moreInfo(h),show:h=>{this.view=h},checkConnection:()=>{this.dialogFromMenu=!1,this.runCheck()},openAutoOff:()=>{this.dialog?.kind==="power"?this.parkDialog("dialog .p-open"):this.dialogBack=void 0,this.dialog={kind:"auto_off"},this.dialogFromMenu=!1}}}views(n){return["status",...n.controlTab?["control"]:[],...n.filamentTab?["filament"]:[]]}header(n){let{hass:i,refs:r}=n,a=r.light?w(i,r.light):void 0,s=r.light&&a?this.switchOn(r.light):!1,d=r.plainLight?"light_plain":"light",l=ce(n),u=gr(n),f=m=>{this.dialog={kind:m},this.dialogFromMenu=!1};return c`<div class="head">
      <span class="dot ${n.online?"on":""}" role="img" aria-label=${o(i,be(n))} title=${o(i,be(n))}></span>
      <div class="names">
        <div class="name" role="heading" aria-level="2" title=${l}>${l}</div>
        ${u?c`<div class="model">${u}</div>`:p}
      </div>
      ${r.light&&n.canControl?c`<button
            class="icon-btn light ${s?"on":""} ${this.pending.has("light")?"pending":""}"
            aria-label=${o(i,d)}
            title=${o(i,d)}
            aria-pressed=${s?"true":"false"}
            aria-busy=${this.pending.has("light")?"true":"false"}
            aria-disabled=${this.pending.has("light")?"true":p}
            ?disabled=${!n.online||a?.state==="unavailable"}
            @click=${()=>{this.toggleSwitch(r.light,"light","light")}}
          >
            ${_(s?"lightOn":"lightOff")}
          </button>`:r.light&&n.viewOnly?c`<span
              class="icon-btn light state ${s?"on":""}"
              role="img"
              aria-label="${o(i,d)}: ${o(i,s?"on":"off")}"
              title="${o(i,d)}: ${o(i,s?"on":"off")}"
              >${_(s?"lightOn":"lightOff")}</span
            >`:p}
      ${this.menu(n)}
    </div>
    ${kr(n,f)}`}tabs(n,i){if(n.length<2)return p;let r=this.hass,a=d=>{this.view=d},s=d=>{let l=n.indexOf(i),u={ArrowRight:l+1,ArrowLeft:l-1,Home:0,End:n.length-1};d.key in u&&(d.preventDefault(),a(n[(u[d.key]+n.length)%n.length]),this.updateComplete.then(()=>this.renderRoot.querySelector('.tabs [aria-selected="true"]')?.focus()))};return c`<div class="tabs" role="tablist" aria-label=${o(r,"aria_views")} @keydown=${s}>
      ${n.map(d=>c`<button
          role="tab"
          id="tab-${d}"
          aria-selected=${d===i?"true":"false"}
          aria-controls=${Qr}
          tabindex=${d===i?0:-1}
          title=${o(r,`tab_${d}`)}
          @click=${()=>a(d)}
        >
          <span class="tab-icon" aria-hidden="true">${_(Ls[d])}</span><span class="tab-text">${o(r,`tab_${d}`)}</span>
        </button>`)}
    </div>`}picture(n){let{hass:i,refs:r,status:a}=n,s=w(i,r.cover),d=s&&z(i,r.cover)?s.attributes.entity_picture:void 0,u=typeof d=="string"&&d!==this.brokenCover&&Je.has(a)?c`<img
          class="cover"
          src=${d}
          alt=""
          @error=${()=>{this.brokenCover=d}}
        />`:_i();return n.startLive?c`<button class="picture" aria-label=${o(i,"live")} title=${o(i,"live")} @click=${this.startLive}>
        ${u}<span class="live-hint">${_("video")}</span>
      </button>`:c`<div class="picture ${n.online?"":"offline-pic"}">${u}</div>`}livePanel(){let n=this.hass,r=this.settings.camera==="tap"?c`<button class="icon-btn live-close" aria-label=${o(n,"live_stop")} title=${o(n,"live_stop")} @click=${this.closeLive}>
          ${_("close")}
        </button>`:p;if(this.streamFailed&&(this.liveWanted||this.settings.camera==="always"))return c`<div class="live failed" role="status">
        ${_("videoOff")}<span>${o(n,"camera_failed")}</span>
        <button class="btn" @click=${this.retryLive}>${o(n,"retry")}</button>
        <div class="live-tools">${r}</div>
      </div>`;if(!this.streamSrc)return p;let a=this.refs?.cameraFps,s=a?n.states[a]:void 0,d=s&&s.state!=="unavailable"&&!this.settings.readOnly?c`<button
            class="icon-btn live-fps-open"
            aria-label=${o(n,"fps_open")}
            title=${o(n,"fps_open")}
            aria-haspopup="dialog"
            @click=${()=>{this.dialogBack=void 0,this.dialog={kind:"camera"},this.dialogFromMenu=!1}}
          >
            ${_("cog")}
          </button>`:p,l=this.frameRate(!0)??this.streamFps;return c`<div class="live">
      <img class="stream" src=${this.streamSrc} alt=${o(n,"live")} @error=${this.streamBroke} />
      <div class="live-tags">
        <span class="live-badge">${o(n,"live_badge")}</span>
        ${l===void 0?p:c`<span class="live-badge live-fps" role="img" aria-label=${o(n,"fps_aria",{fps:l})}>${o(n,"fps_value",{fps:l})}</span>`}
      </div>
      <div class="live-tools">${d}${r}</div>
    </div>`}errorLine(){let n=this.hass;return this.error?c`<div class="toast" role="alert">
      ${_("error")}<span>${this.error}</span>
      <button class="icon-btn" aria-label=${o(n,"error_dismiss")} title=${o(n,"error_dismiss")} @click=${this.closeError}>${_("close")}</button>
    </div>`:this.sent?rt("sent-slot",o(n,"sent")):p}render(){let n=this.hass,i=this.config;if(!n||!i)return p;let r=this.refs;if(!r){let f=i.printer?n.devices[i.printer]?"not_a_printer":"not_found":"no_printer";return c`<ha-card><div class="message">${o(n,f)}</div></ha-card>`}let a=this.context(n,r);this.followStarting(gn(a)!==void 0);let s=this.views(a),d=s.includes(this.view)?this.view:"status",l;!a.online&&d!=="status"?l=a.examples?it(a,nt(a),d==="control"?nn(Le(a),this.step,this.setStep):Tn(Le(a))):Pn(a,this.picture(a)):d==="control"?l=nn(a,this.step,this.setStep):d==="filament"?l=Tn(a):l=Xr(a,this.picture(a));let u=s.length>1;return c`<ha-card>
      <div class="card-status sr-only" role="status" aria-atomic="true">${ce(a)}: ${a.online?Mn(a,!0):o(n,be(a))}</div>
      ${this.header(a)}${this.tabs(s,d)}${this.livePanel()}
      <div
        class="body"
        role=${u?"tabpanel":p}
        id=${u?Qr:p}
        aria-labelledby=${u?`tab-${d}`:p}
      >
        ${l}
      </div>
      ${this.dialog?Or(a,this.dialog,this.dialogActions,this.errorLine()):this.errorLine()}
    </ha-card>`}};Rn(En,Et);Zr(Ds,On,{name:()=>o(void 0,"picker_name"),description:()=>o(void 0,"picker_description")});
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
*/
