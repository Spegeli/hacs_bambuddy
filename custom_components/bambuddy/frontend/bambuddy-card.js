var ae=globalThis,le=ae.ShadowRoot&&(ae.ShadyCSS===void 0||ae.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,Ce=Symbol(),nt=new WeakMap,G=class{constructor(t,e,i){if(this._$cssResult$=!0,i!==Ce)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=t,this.t=e}get styleSheet(){let t=this.o,e=this.t;if(le&&t===void 0){let i=e!==void 0&&e.length===1;i&&(t=nt.get(e)),t===void 0&&((this.o=t=new CSSStyleSheet).replaceSync(this.cssText),i&&nt.set(e,t))}return t}toString(){return this.cssText}},it=n=>new G(typeof n=="string"?n:n+"",void 0,Ce),Ae=(n,...t)=>{let e=n.length===1?n[0]:t.reduce((i,r,o)=>i+(a=>{if(a._$cssResult$===!0)return a.cssText;if(typeof a=="number")return a;throw Error("Value passed to 'css' function must be a 'css' function result: "+a+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(r)+n[o+1],n[0]);return new G(e,n,Ce)},rt=(n,t)=>{if(le)n.adoptedStyleSheets=t.map(e=>e instanceof CSSStyleSheet?e:e.styleSheet);else for(let e of t){let i=document.createElement("style"),r=ae.litNonce;r!==void 0&&i.setAttribute("nonce",r),i.textContent=e.cssText,n.appendChild(i)}},Le=le?n=>n:n=>n instanceof CSSStyleSheet?(t=>{let e="";for(let i of t.cssRules)e+=i.cssText;return it(e)})(n):n;var{is:$n,defineProperty:kn,getOwnPropertyDescriptor:Cn,getOwnPropertyNames:An,getOwnPropertySymbols:Ln,getPrototypeOf:Sn}=Object,de=globalThis,ot=de.trustedTypes,Tn=ot?ot.emptyScript:"",Hn=de.reactiveElementPolyfillSupport,q=(n,t)=>n,Se={toAttribute(n,t){switch(t){case Boolean:n=n?Tn:null;break;case Object:case Array:n=n==null?n:JSON.stringify(n)}return n},fromAttribute(n,t){let e=n;switch(t){case Boolean:e=n!==null;break;case Number:e=n===null?null:Number(n);break;case Object:case Array:try{e=JSON.parse(n)}catch{e=null}}return e}},at=(n,t)=>!$n(n,t),st={attribute:!0,type:String,converter:Se,reflect:!1,useDefault:!1,hasChanged:at};Symbol.metadata??=Symbol("metadata"),de.litPropertyMetadata??=new WeakMap;var D=class extends HTMLElement{static addInitializer(t){this._$Ei(),(this.l??=[]).push(t)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(t,e=st){if(e.state&&(e.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(t)&&((e=Object.create(e)).wrapped=!0),this.elementProperties.set(t,e),!e.noAccessor){let i=Symbol(),r=this.getPropertyDescriptor(t,i,e);r!==void 0&&kn(this.prototype,t,r)}}static getPropertyDescriptor(t,e,i){let{get:r,set:o}=Cn(this.prototype,t)??{get(){return this[e]},set(a){this[e]=a}};return{get:r,set(a){let l=r?.call(this);o?.call(this,a),this.requestUpdate(t,l,i)},configurable:!0,enumerable:!0}}static getPropertyOptions(t){return this.elementProperties.get(t)??st}static _$Ei(){if(this.hasOwnProperty(q("elementProperties")))return;let t=Sn(this);t.finalize(),t.l!==void 0&&(this.l=[...t.l]),this.elementProperties=new Map(t.elementProperties)}static finalize(){if(this.hasOwnProperty(q("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(q("properties"))){let e=this.properties,i=[...An(e),...Ln(e)];for(let r of i)this.createProperty(r,e[r])}let t=this[Symbol.metadata];if(t!==null){let e=litPropertyMetadata.get(t);if(e!==void 0)for(let[i,r]of e)this.elementProperties.set(i,r)}this._$Eh=new Map;for(let[e,i]of this.elementProperties){let r=this._$Eu(e,i);r!==void 0&&this._$Eh.set(r,e)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(t){let e=[];if(Array.isArray(t)){let i=new Set(t.flat(1/0).reverse());for(let r of i)e.unshift(Le(r))}else t!==void 0&&e.push(Le(t));return e}static _$Eu(t,e){let i=e.attribute;return i===!1?void 0:typeof i=="string"?i:typeof t=="string"?t.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(t=>this.enableUpdating=t),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(t=>t(this))}addController(t){(this._$EO??=new Set).add(t),this.renderRoot!==void 0&&this.isConnected&&t.hostConnected?.()}removeController(t){this._$EO?.delete(t)}_$E_(){let t=new Map,e=this.constructor.elementProperties;for(let i of e.keys())this.hasOwnProperty(i)&&(t.set(i,this[i]),delete this[i]);t.size>0&&(this._$Ep=t)}createRenderRoot(){let t=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return rt(t,this.constructor.elementStyles),t}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach(t=>t.hostConnected?.())}enableUpdating(t){}disconnectedCallback(){this._$EO?.forEach(t=>t.hostDisconnected?.())}attributeChangedCallback(t,e,i){this._$AK(t,i)}_$ET(t,e){let i=this.constructor.elementProperties.get(t),r=this.constructor._$Eu(t,i);if(r!==void 0&&i.reflect===!0){let o=(i.converter?.toAttribute!==void 0?i.converter:Se).toAttribute(e,i.type);this._$Em=t,o==null?this.removeAttribute(r):this.setAttribute(r,o),this._$Em=null}}_$AK(t,e){let i=this.constructor,r=i._$Eh.get(t);if(r!==void 0&&this._$Em!==r){let o=i.getPropertyOptions(r),a=typeof o.converter=="function"?{fromAttribute:o.converter}:o.converter?.fromAttribute!==void 0?o.converter:Se;this._$Em=r;let l=a.fromAttribute(e,o.type);this[r]=l??this._$Ej?.get(r)??l,this._$Em=null}}requestUpdate(t,e,i,r=!1,o){if(t!==void 0){let a=this.constructor;if(r===!1&&(o=this[t]),i??=a.getPropertyOptions(t),!((i.hasChanged??at)(o,e)||i.useDefault&&i.reflect&&o===this._$Ej?.get(t)&&!this.hasAttribute(a._$Eu(t,i))))return;this.C(t,e,i)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(t,e,{useDefault:i,reflect:r,wrapped:o},a){i&&!(this._$Ej??=new Map).has(t)&&(this._$Ej.set(t,a??e??this[t]),o!==!0||a!==void 0)||(this._$AL.has(t)||(this.hasUpdated||i||(e=void 0),this._$AL.set(t,e)),r===!0&&this._$Em!==t&&(this._$Eq??=new Set).add(t))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(e){Promise.reject(e)}let t=this.scheduleUpdate();return t!=null&&await t,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(let[r,o]of this._$Ep)this[r]=o;this._$Ep=void 0}let i=this.constructor.elementProperties;if(i.size>0)for(let[r,o]of i){let{wrapped:a}=o,l=this[r];a!==!0||this._$AL.has(r)||l===void 0||this.C(r,void 0,o,l)}}let t=!1,e=this._$AL;try{t=this.shouldUpdate(e),t?(this.willUpdate(e),this._$EO?.forEach(i=>i.hostUpdate?.()),this.update(e)):this._$EM()}catch(i){throw t=!1,this._$EM(),i}t&&this._$AE(e)}willUpdate(t){}_$AE(t){this._$EO?.forEach(e=>e.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(t)),this.updated(t)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(t){return!0}update(t){this._$Eq&&=this._$Eq.forEach(e=>this._$ET(e,this[e])),this._$EM()}updated(t){}firstUpdated(t){}};D.elementStyles=[],D.shadowRootOptions={mode:"open"},D[q("elementProperties")]=new Map,D[q("finalized")]=new Map,Hn?.({ReactiveElement:D}),(de.reactiveElementVersions??=[]).push("2.1.2");var Re=globalThis,lt=n=>n,pe=Re.trustedTypes,dt=pe?pe.createPolicy("lit-html",{createHTML:n=>n}):void 0,ht="$lit$",V=`lit$${Math.random().toFixed(9).slice(2)}$`,gt="?"+V,zn=`<${gt}>`,I=document,X=()=>I.createComment(""),J=n=>n===null||typeof n!="object"&&typeof n!="function",Ve=Array.isArray,En=n=>Ve(n)||typeof n?.[Symbol.iterator]=="function",Te=`[ 	
\f\r]`,Y=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,pt=/-->/g,ct=/>/g,P=RegExp(`>|${Te}(?:([^\\s"'>=/]+)(${Te}*=${Te}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),ut=/'/g,mt=/"/g,bt=/^(?:script|style|textarea|title)$/i,Oe=n=>(t,...e)=>({_$litType$:n,strings:t,values:e}),c=Oe(1),Ne=Oe(2),sr=Oe(3),j=Symbol.for("lit-noChange"),p=Symbol.for("lit-nothing"),ft=new WeakMap,F=I.createTreeWalker(I,129);function vt(n,t){if(!Ve(n)||!n.hasOwnProperty("raw"))throw Error("invalid template strings array");return dt!==void 0?dt.createHTML(t):t}var Mn=(n,t)=>{let e=n.length-1,i=[],r,o=t===2?"<svg>":t===3?"<math>":"",a=Y;for(let l=0;l<e;l++){let d=n[l],u,m,f=-1,g=0;for(;g<d.length&&(a.lastIndex=g,m=a.exec(d),m!==null);)g=a.lastIndex,a===Y?m[1]==="!--"?a=pt:m[1]!==void 0?a=ct:m[2]!==void 0?(bt.test(m[2])&&(r=RegExp("</"+m[2],"g")),a=P):m[3]!==void 0&&(a=P):a===P?m[0]===">"?(a=r??Y,f=-1):m[1]===void 0?f=-2:(f=a.lastIndex-m[2].length,u=m[1],a=m[3]===void 0?P:m[3]==='"'?mt:ut):a===mt||a===ut?a=P:a===pt||a===ct?a=Y:(a=P,r=void 0);let v=a===P&&n[l+1].startsWith("/>")?" ":"";o+=a===Y?d+zn:f>=0?(i.push(u),d.slice(0,f)+ht+d.slice(f)+V+v):d+V+(f===-2?l:v)}return[vt(n,o+(n[e]||"<?>")+(t===2?"</svg>":t===3?"</math>":"")),i]},Q=class n{constructor({strings:t,_$litType$:e},i){let r;this.parts=[];let o=0,a=0,l=t.length-1,d=this.parts,[u,m]=Mn(t,e);if(this.el=n.createElement(u,i),F.currentNode=this.el.content,e===2||e===3){let f=this.el.content.firstChild;f.replaceWith(...f.childNodes)}for(;(r=F.nextNode())!==null&&d.length<l;){if(r.nodeType===1){if(r.hasAttributes())for(let f of r.getAttributeNames())if(f.endsWith(ht)){let g=m[a++],v=r.getAttribute(f).split(V),C=/([.?@])?(.*)/.exec(g);d.push({type:1,index:o,name:C[2],strings:v,ctor:C[1]==="."?ze:C[1]==="?"?Ee:C[1]==="@"?Me:K}),r.removeAttribute(f)}else f.startsWith(V)&&(d.push({type:6,index:o}),r.removeAttribute(f));if(bt.test(r.tagName)){let f=r.textContent.split(V),g=f.length-1;if(g>0){r.textContent=pe?pe.emptyScript:"";for(let v=0;v<g;v++)r.append(f[v],X()),F.nextNode(),d.push({type:2,index:++o});r.append(f[g],X())}}}else if(r.nodeType===8)if(r.data===gt)d.push({type:2,index:o});else{let f=-1;for(;(f=r.data.indexOf(V,f+1))!==-1;)d.push({type:7,index:o}),f+=V.length-1}o++}}static createElement(t,e){let i=I.createElement("template");return i.innerHTML=t,i}};function B(n,t,e=n,i){if(t===j)return t;let r=i!==void 0?e._$Co?.[i]:e._$Cl,o=J(t)?void 0:t._$litDirective$;return r?.constructor!==o&&(r?._$AO?.(!1),o===void 0?r=void 0:(r=new o(n),r._$AT(n,e,i)),i!==void 0?(e._$Co??=[])[i]=r:e._$Cl=r),r!==void 0&&(t=B(n,r._$AS(n,t.values),r,i)),t}var He=class{constructor(t,e){this._$AV=[],this._$AN=void 0,this._$AD=t,this._$AM=e}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(t){let{el:{content:e},parts:i}=this._$AD,r=(t?.creationScope??I).importNode(e,!0);F.currentNode=r;let o=F.nextNode(),a=0,l=0,d=i[0];for(;d!==void 0;){if(a===d.index){let u;d.type===2?u=new ee(o,o.nextSibling,this,t):d.type===1?u=new d.ctor(o,d.name,d.strings,this,t):d.type===6&&(u=new De(o,this,t)),this._$AV.push(u),d=i[++l]}a!==d?.index&&(o=F.nextNode(),a++)}return F.currentNode=I,r}p(t){let e=0;for(let i of this._$AV)i!==void 0&&(i.strings!==void 0?(i._$AI(t,i,e),e+=i.strings.length-2):i._$AI(t[e])),e++}},ee=class n{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(t,e,i,r){this.type=2,this._$AH=p,this._$AN=void 0,this._$AA=t,this._$AB=e,this._$AM=i,this.options=r,this._$Cv=r?.isConnected??!0}get parentNode(){let t=this._$AA.parentNode,e=this._$AM;return e!==void 0&&t?.nodeType===11&&(t=e.parentNode),t}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(t,e=this){t=B(this,t,e),J(t)?t===p||t==null||t===""?(this._$AH!==p&&this._$AR(),this._$AH=p):t!==this._$AH&&t!==j&&this._(t):t._$litType$!==void 0?this.$(t):t.nodeType!==void 0?this.T(t):En(t)?this.k(t):this._(t)}O(t){return this._$AA.parentNode.insertBefore(t,this._$AB)}T(t){this._$AH!==t&&(this._$AR(),this._$AH=this.O(t))}_(t){this._$AH!==p&&J(this._$AH)?this._$AA.nextSibling.data=t:this.T(I.createTextNode(t)),this._$AH=t}$(t){let{values:e,_$litType$:i}=t,r=typeof i=="number"?this._$AC(t):(i.el===void 0&&(i.el=Q.createElement(vt(i.h,i.h[0]),this.options)),i);if(this._$AH?._$AD===r)this._$AH.p(e);else{let o=new He(r,this),a=o.u(this.options);o.p(e),this.T(a),this._$AH=o}}_$AC(t){let e=ft.get(t.strings);return e===void 0&&ft.set(t.strings,e=new Q(t)),e}k(t){Ve(this._$AH)||(this._$AH=[],this._$AR());let e=this._$AH,i,r=0;for(let o of t)r===e.length?e.push(i=new n(this.O(X()),this.O(X()),this,this.options)):i=e[r],i._$AI(o),r++;r<e.length&&(this._$AR(i&&i._$AB.nextSibling,r),e.length=r)}_$AR(t=this._$AA.nextSibling,e){for(this._$AP?.(!1,!0,e);t!==this._$AB;){let i=lt(t).nextSibling;lt(t).remove(),t=i}}setConnected(t){this._$AM===void 0&&(this._$Cv=t,this._$AP?.(t))}},K=class{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(t,e,i,r,o){this.type=1,this._$AH=p,this._$AN=void 0,this.element=t,this.name=e,this._$AM=r,this.options=o,i.length>2||i[0]!==""||i[1]!==""?(this._$AH=Array(i.length-1).fill(new String),this.strings=i):this._$AH=p}_$AI(t,e=this,i,r){let o=this.strings,a=!1;if(o===void 0)t=B(this,t,e,0),a=!J(t)||t!==this._$AH&&t!==j,a&&(this._$AH=t);else{let l=t,d,u;for(t=o[0],d=0;d<o.length-1;d++)u=B(this,l[i+d],e,d),u===j&&(u=this._$AH[d]),a||=!J(u)||u!==this._$AH[d],u===p?t=p:t!==p&&(t+=(u??"")+o[d+1]),this._$AH[d]=u}a&&!r&&this.j(t)}j(t){t===p?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,t??"")}},ze=class extends K{constructor(){super(...arguments),this.type=3}j(t){this.element[this.name]=t===p?void 0:t}},Ee=class extends K{constructor(){super(...arguments),this.type=4}j(t){this.element.toggleAttribute(this.name,!!t&&t!==p)}},Me=class extends K{constructor(t,e,i,r,o){super(t,e,i,r,o),this.type=5}_$AI(t,e=this){if((t=B(this,t,e,0)??p)===j)return;let i=this._$AH,r=t===p&&i!==p||t.capture!==i.capture||t.once!==i.once||t.passive!==i.passive,o=t!==p&&(i===p||r);r&&this.element.removeEventListener(this.name,this,i),o&&this.element.addEventListener(this.name,this,t),this._$AH=t}handleEvent(t){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,t):this._$AH.handleEvent(t)}},De=class{constructor(t,e,i){this.element=t,this.type=6,this._$AN=void 0,this._$AM=e,this.options=i}get _$AU(){return this._$AM._$AU}_$AI(t){B(this,t)}};var Dn=Re.litHtmlPolyfillSupport;Dn?.(Q,ee),(Re.litHtmlVersions??=[]).push("3.3.3");var xt=(n,t,e)=>{let i=e?.renderBefore??t,r=i._$litPart$;if(r===void 0){let o=e?.renderBefore??null;i._$litPart$=r=new ee(t.insertBefore(X(),o),o,void 0,e??{})}return r._$AI(n),r};var Pe=globalThis,O=class extends D{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){let t=super.createRenderRoot();return this.renderOptions.renderBefore??=t.firstChild,t}update(t){let e=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(t),this._$Do=xt(e,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return j}};O._$litElement$=!0,O.finalized=!0,Pe.litElementHydrateSupport?.({LitElement:O});var Rn=Pe.litElementPolyfillSupport;Rn?.({LitElement:O});(Pe.litElementVersions??=[]).push("4.2.2");var _t={picker_name:"BamBuddy-Drucker",picker_description:"Zeigt und steuert einen Drucker aus BamBuddy: Fortschritt, Kamera, Temperaturen, Filament und Achsen bewegen.",no_printer:"W\xE4hle in den Einstellungen der Karte einen Drucker.",not_found:"Dieser Drucker ist nicht mehr verf\xFCgbar. W\xE4hle in den Einstellungen der Karte einen anderen.",not_a_printer:"Dieses Ger\xE4t ist kein BamBuddy-Drucker. W\xE4hle den Drucker selbst, keine AMS-Einheit.",invalid_option:"Ung\xFCltiger Wert f\xFCr \u201E{option}\u201C: {value}. Erlaubt: {allowed}.",allowed_device:"die ID eines Drucker-Ger\xE4ts",editor_printer:"Drucker",editor_printer_help:"Ein Drucker der BamBuddy-Integration, keine AMS-Einheit.",editor_camera:"Kamera",editor_camera_help:"Live-Video braucht Bandbreite: nach Antippen l\xE4uft es nur, solange du zusiehst.",camera_tap:"Live-Ansicht nach Antippen",camera_always:"Immer live",camera_off:"Aus",show_temperatures:"Temperaturen",show_fans:"L\xFCfter",show_ams:"AMS und Filament",show_controls:"Steuerung",tab_status:"Status",tab_control:"Steuerung",tab_filament:"Filament",aria_views:"Ansichten",online:"Online",offline:"Offline",light:"Kammerbeleuchtung",dismiss:"Schlie\xDFen",back:"Zur\xFCck",error_generic:"Das hat nicht geklappt. Versuche es gleich noch einmal.",sent:"Gesendet",ams_activity:"AMS: {state}",more:"Weitere Optionen",menu_device_page:"Ger\xE4teseite \xF6ffnen",menu_info:"Druckerinformationen",menu_refresh:"Status aktualisieren",wifi:"WLAN",wifi_signal:"WLAN-Signal: {value}",lan:"LAN",hms_ok:"HMS OK",hms_pill:"{count} HMS",hms_pill_aria:"HMS-Meldungen: {count}",hms_pill_none:"HMS-Meldungen: keine",hms_title:"HMS-Meldungen",hms_none:"Keine Meldungen",hms_more:"+{n} weitere",hms_clear_note:"Fehler, die der Drucker weiter sieht, meldet er nach dem L\xF6schen erneut.",firmware:"Firmware",firmware_update:"Firmware {version}: Update verf\xFCgbar",firmware_offline:"Firmware {version} (Drucker offline)",firmware_current:"Firmware {version}: aktuell",firmware_version:"Firmware {version}",firmware_installed:"Installiert",firmware_latest:"Neueste",firmware_available:"Verf\xFCgbar",firmware_notes:"Versionshinweise",firmware_note:"Installiere Updates am Drucker, in Bambu Handy oder in BamBuddy.",info_model:"Modell",info_name:"Name in BamBuddy",info_server:"BamBuddy-Server",info_status:"Status",info_print_status:"Druckstatus",info_ip:"IP-Adresse",info_serial:"Seriennummer",info_network:"Netzwerk",info_developer:"Entwicklermodus",info_nozzles:"D\xFCsen",info_hours:"Druckstunden",info_on:"An",info_off:"Aus",info_developer_note:"Befehle werden m\xF6glicherweise ignoriert.",nozzle_count_one:"1 D\xFCse",nozzle_count:"{count} D\xFCsen",nozzle_side:"{side}: {nozzle}",copy_ip:"IP-Adresse kopieren",copy_serial:"Seriennummer kopieren",copied:"Kopiert",no_job:"Kein Druck aktiv",offline_text:"Der Drucker ist offline. Pr\xFCfe, ob er eingeschaltet und mit BamBuddy verbunden ist.",layer:"Schicht {current} / {total}",remaining:"noch {time}",ends:"Ende {time}",progress:"Fortschritt",live:"Live-Ansicht",live_badge:"Live",live_stop:"Live-Ansicht schlie\xDFen",camera_failed:"Die Kamera ist nicht verf\xFCgbar.",retry:"Erneut versuchen",nozzle:"D\xFCse",nozzle_left:"Linke D\xFCse",nozzle_right:"Rechte D\xFCse",bed:"Bett",chamber:"Kammer",heater_off:"Aus",target:"Ziel {value}",fan_part:"Bauteil",fan_aux:"Zusatz",fan_chamber:"Kammer",fan_exhaust:"Abluft",fan_left_aux:"Linker Zusatz",fan_hotend:"Hotend",fan_part_name:"Bauteill\xFCfter",fan_aux_name:"Zusatzl\xFCfter",fan_chamber_name:"Kammerl\xFCfter",fan_exhaust_name:"Abluftl\xFCfter",fan_left_aux_name:"Linker Zusatzl\xFCfter",fan_hotend_name:"Hotend-L\xFCfter",fan_off:"Aus",fans:"L\xFCfter",filament:"Filament",open_filament:"Filament-Ansicht \xF6ffnen",side_left_short:"L",side_right_short:"R",external_short:"Ext",hms_error:"Fehler",hms_warning:"Warnung",hms_notice:"Hinweis",hms_unknown:"HMS-Meldung",hms_count:"HMS-Fehler: {count}",hms_clear:"HMS-Fehler l\xF6schen",plate_text:"R\xE4ume die Druckplatte und best\xE4tige es. Der n\xE4chste Druck wartet darauf.",plate_cleared:"Druckplatte ger\xE4umt",pause:"Druck pausieren",resume:"Druck fortsetzen",paused_empty:"Kein Filament geladen. Lade eines im Tab \u201EFilament\u201C, bevor du fortsetzt.",stop:"Druck stoppen",speed:"Druckgeschwindigkeit",read_only:"Zum Steuern braucht der API-Schl\xFCssel in BamBuddy \u201EControl Printer\u201C.",developer_off:"Der Entwicklermodus (LAN) ist aus: Der Drucker ignoriert Befehle.",stop_title:"Druck stoppen?",stop_text:"Der Druck l\xE4sst sich danach nicht fortsetzen.",stop_keep:"Weiterdrucken",stop_confirm:"Druck stoppen",skip:"Objekte \xFCberspringen",skip_one:"1 Objekt \xFCberspringen",skip_many:"{count} Objekte \xFCberspringen",skip_keep:"Nichts \xFCberspringen",skip_text:"\xDCbersprungene Objekte werden in diesem Druck nicht mehr gedruckt.",skip_loading:"Objekte werden geladen \u2026",skip_none_listed:"BamBuddy kennt keine Objekte dieses Drucks.",skip_object:"Objekt {id}",skip_skipped:"\xDCbersprungen",skip_all:"Um alle Objekte zu \xFCberspringen, stoppe stattdessen den Druck.",heating:"Heizen",heat_now:"Jetzt {value}",heat_lower:"{what} {step}\xA0\xB0C k\xFChler",heat_raise:"{what} {step}\xA0\xB0C w\xE4rmer",heat_start:"{what} auf {value} heizen",heat_off:"{what} ausschalten",cool_down:"Abk\xFChlen",active_nozzle:"Aktive D\xFCse",nozzle_active:"aktiv",step:"Schritt",move:"{axis} um {distance} mm bewegen",home:"Referenzfahrt",home_title:"Alle Achsen referenzieren?",home_text:"Der Druckkopf f\xE4hrt in seine Ausgangsposition; nimm vorher alles von der Druckplatte.",bed_axis:"Bett",bed_closer:"N\xE4her",bed_away:"Weiter weg",bed_closer_aria:"Bett {step} mm n\xE4her an die D\xFCse",bed_away_aria:"Bett {step} mm weiter weg von der D\xFCse",extruder:"Extruder",extrude:"Extrudieren",retract:"Zur\xFCckziehen",extrude_aria:"{length} mm Filament extrudieren",retract_aria:"{length} mm Filament zur\xFCckziehen",cold_nozzle:"Zum Extrudieren die D\xFCse unter \u201EHeizen\u201C auf mindestens 170\xA0\xB0C heizen.",cold_nozzle_left:"Zum Extrudieren die linke D\xFCse (aktiv) unter \u201EHeizen\u201C auf mindestens 170\xA0\xB0C heizen.",cold_nozzle_right:"Zum Extrudieren die rechte D\xFCse (aktiv) unter \u201EHeizen\u201C auf mindestens 170\xA0\xB0C heizen.",jog_note:"Zuerst referenzieren. Der Drucker begrenzt diese Bewegungen nicht.",busy_reason:"Bewegen und Extrudieren sind m\xF6glich, sobald der Druck fertig ist.",changing_reason:"Warte, bis der Filamentwechsel fertig ist.",offline_reason:"Der Drucker ist offline.",detection:"Druckoptionen",detection_all_on:"Alle an",detection_off:"{off} aus",detection_all_off:"Alle aus",detection_hint:"An: Der Drucker pausiert den Druck, wenn er das Problem erkennt. Empfindlichkeit wie am Drucker eingestellt. Eine ausgeschaltete Erkennung bleibt aus, auch bei den n\xE4chsten Drucken.",detection_ai_monitoring:"KI-Druck\xFCberwachung",detection_ai_monitoring_x1:"Spaghetti und Stau im Auswurfschacht",detection_first_layer_inspection:"Inspektion der ersten Schicht",detection_build_plate_detection:"Druckplattenerkennung",detection_build_plate_position_detection:"Positionserkennung der Druckplatte",detection_spaghetti_detection:"Spaghetti-Erkennung",detection_pileup_detection:"Auswurfschacht-\xDCberwachung",detection_clumping_detection:"Erkennung von D\xFCsenklumpen",detection_air_printing_detection:"Druck-ins-Leere-Erkennung",external:"Externe Spule",externals:"Externe Spulen",left:"Links",right:"Rechts",humidity:"Feuchte",temperature:"Temperatur",empty:"Leer",not_set:"Nicht festgelegt",unknown:"Unbekannt",filament_offline:"Inhalt unbekannt, solange der Drucker offline ist.",in_use:"In Gebrauch",load:"Laden",unload:"Entladen",load_title:"{filament} laden?",load_text:"Der Drucker heizt die D\xFCse, entl\xE4dt das aktuelle Filament und l\xE4dt dieses. Das dauert einige Minuten.",unload_title:"Filament entladen?",unload_text:"Der Drucker heizt die D\xFCse und zieht das Filament zur\xFCck.",ht_load:"Filament aus dem AMS HT am Display des Druckers laden.",filament_pause:"Pausiere den Druck, um das Filament zu wechseln.",paused_change:"Der Druck bleibt pausiert. Setze ihn fort, wenn das neue Filament drin ist.",drying:"Trocknet \xB7 noch {time}",drying_now:"Trocknet",not_drying:"Trocknet nicht",dry:"Trocknen",dry_stop:"Trocknen stoppen",dry_title:"Filament in {unit} trocknen",dry_temperature:"Temperatur",dry_duration:"Dauer",dry_start:"Trocknen starten",dry_suggested:"Empfehlung f\xFCr das geladene Filament.",dry_mixed:"F\xFCr die empfindlichste Spule eingestellt: {spools}",decrease:"{what} verringern",increase:"{what} erh\xF6hen",set_filament:"Filament festlegen",set_filament_external:"Filament der externen Spule festlegen",set_filament_left:"Filament der linken externen Spule festlegen",set_filament_right:"Filament der rechten externen Spule festlegen",slot_label:"Fach {slot} \xB7 {unit}",filament_title:"Filament von {slot}",filament_title_external:"Filament der externen Spule",filament_title_left:"Filament der linken externen Spule",filament_title_right:"Filament der rechten externen Spule",material:"Material",material_keep:"{name} behalten",material_choose:"W\xE4hlen \u2026",color:"Farbe",color_other:"Andere Farbe \u2026",color_current:"Aktuelle Farbe",color_chosen:"Gew\xE4hlte Farbe",color_white:"Wei\xDF",color_black:"Schwarz",color_gray:"Grau",color_silver:"Silber",color_red:"Rot",color_orange:"Orange",color_yellow:"Gelb",color_green:"Gr\xFCn",color_turquoise:"T\xFCrkis",color_cyan:"Cyan",color_blue:"Blau",color_purple:"Lila",color_pink:"Pink",color_brown:"Braun",color_beige:"Beige",color_gold:"Gold",filament_note:"F\xFCr Spulen ohne Chip. Ein neues Material nutzt das generische Profil von Bambu und den Standard\u2011K\u2011Wert.",filament_set:"\xDCbernehmen",filament_need_material:"W\xE4hle noch ein Material.",dur_min:"{m} Min.",dur_h:"{h} Std.",dur_hm:"{h} Std. {m} Min.",dur_dh:"{d} T. {h} Std.",hours:"Std."};var yt={picker_name:"BamBuddy printer",picker_description:"Shows and controls a printer from BamBuddy: progress, camera, temperatures, filament and moving the axes.",no_printer:"Choose a printer in the card's settings.",not_found:"This printer is no longer available. Choose another one in the card's settings.",not_a_printer:"This device is not a BamBuddy printer. Choose the printer itself, not an AMS unit.",invalid_option:"Invalid value for \u201C{option}\u201D: {value}. Allowed: {allowed}.",allowed_device:"the ID of a printer device",editor_printer:"Printer",editor_printer_help:"A printer of the BamBuddy integration, not an AMS unit.",editor_camera:"Camera",editor_camera_help:"Live video uses bandwidth: after a tap it runs only while you watch.",camera_tap:"Live view after a tap",camera_always:"Always live",camera_off:"Off",show_temperatures:"Temperatures",show_fans:"Fans",show_ams:"AMS and filament",show_controls:"Controls",tab_status:"Status",tab_control:"Control",tab_filament:"Filament",aria_views:"Views",online:"Online",offline:"Offline",light:"Chamber light",dismiss:"Close",back:"Back",error_generic:"That did not work. Try again in a moment.",sent:"Sent",ams_activity:"AMS: {state}",more:"More options",menu_device_page:"Open device page",menu_info:"Printer information",menu_refresh:"Refresh status",wifi:"Wi-Fi",wifi_signal:"Wi-Fi signal: {value}",lan:"LAN",hms_ok:"HMS OK",hms_pill:"{count} HMS",hms_pill_aria:"HMS messages: {count}",hms_pill_none:"HMS messages: none",hms_title:"HMS messages",hms_none:"No messages",hms_more:"+{n} more",hms_clear_note:"Errors the printer still sees come back after clearing.",firmware:"Firmware",firmware_update:"Firmware {version}: update available",firmware_offline:"Firmware {version} (printer offline)",firmware_current:"Firmware {version}: up to date",firmware_version:"Firmware {version}",firmware_installed:"Installed",firmware_latest:"Latest",firmware_available:"Available",firmware_notes:"Release notes",firmware_note:"Install updates on the printer, in Bambu Handy or in BamBuddy.",info_model:"Model",info_name:"Name in BamBuddy",info_server:"BamBuddy server",info_status:"Status",info_print_status:"Print status",info_ip:"IP address",info_serial:"Serial number",info_network:"Network",info_developer:"Developer mode",info_nozzles:"Nozzles",info_hours:"Print hours",info_on:"On",info_off:"Off",info_developer_note:"Commands may be ignored.",nozzle_count_one:"1 nozzle",nozzle_count:"{count} nozzles",nozzle_side:"{side}: {nozzle}",copy_ip:"Copy IP address",copy_serial:"Copy serial number",copied:"Copied",no_job:"No print running",offline_text:"The printer is offline. Check that it is switched on and connected to BamBuddy.",layer:"Layer {current} / {total}",remaining:"{time} left",ends:"Ends {time}",progress:"Progress",live:"Live view",live_badge:"Live",live_stop:"Close the live view",camera_failed:"The camera is not available.",retry:"Try again",nozzle:"Nozzle",nozzle_left:"Left nozzle",nozzle_right:"Right nozzle",bed:"Bed",chamber:"Chamber",heater_off:"Off",target:"Target {value}",fan_part:"Part cooling",fan_aux:"Auxiliary",fan_chamber:"Chamber",fan_exhaust:"Exhaust",fan_left_aux:"Left auxiliary",fan_hotend:"Hotend",fan_part_name:"Part cooling fan",fan_aux_name:"Auxiliary fan",fan_chamber_name:"Chamber fan",fan_exhaust_name:"Exhaust fan",fan_left_aux_name:"Left auxiliary fan",fan_hotend_name:"Hotend fan",fan_off:"Off",fans:"Fans",filament:"Filament",open_filament:"Open the filament view",side_left_short:"L",side_right_short:"R",external_short:"Ext",hms_error:"Error",hms_warning:"Warning",hms_notice:"Notice",hms_unknown:"HMS message",hms_count:"HMS errors: {count}",hms_clear:"Clear HMS errors",plate_text:"Clear the build plate, then confirm. The next print waits for it.",plate_cleared:"Plate cleared",pause:"Pause print",resume:"Resume print",paused_empty:"No filament loaded. Load one in the Filament tab before resuming.",stop:"Stop print",speed:"Print speed",read_only:"Controls need an API key with \u201CControl Printer\u201D in BamBuddy.",developer_off:"Developer LAN mode is off: the printer ignores commands.",stop_title:"Stop the print?",stop_text:"The print cannot be resumed.",stop_keep:"Keep printing",stop_confirm:"Stop print",skip:"Skip objects",skip_one:"Skip 1 object",skip_many:"Skip {count} objects",skip_keep:"Skip none",skip_text:"Skipped objects cannot be printed again in this job.",skip_loading:"Loading the objects \u2026",skip_none_listed:"BamBuddy lists no objects for this print.",skip_object:"Object {id}",skip_skipped:"Skipped",skip_all:"To skip every object, stop the print instead.",heating:"Heating",heat_now:"Now {value}",heat_lower:"{what} {step}\xA0\xB0C cooler",heat_raise:"{what} {step}\xA0\xB0C hotter",heat_start:"Heat {what} to {value}",heat_off:"Turn {what} off",cool_down:"Cool down",active_nozzle:"Active nozzle",nozzle_active:"active",step:"Step",move:"Move {axis} by {distance} mm",home:"Home",home_title:"Home all axes?",home_text:"The toolhead moves to its home position; remove anything from the plate first.",bed_axis:"Bed",bed_closer:"Closer",bed_away:"Away",bed_closer_aria:"Move the bed {step} mm closer to the nozzle",bed_away_aria:"Move the bed {step} mm away from the nozzle",extruder:"Extruder",extrude:"Extrude",retract:"Retract",extrude_aria:"Extrude {length} mm of filament",retract_aria:"Retract {length} mm of filament",cold_nozzle:"To extrude, heat the nozzle to at least 170\xA0\xB0C under Heating.",cold_nozzle_left:"To extrude, heat the left nozzle (active) to at least 170\xA0\xB0C under Heating.",cold_nozzle_right:"To extrude, heat the right nozzle (active) to at least 170\xA0\xB0C under Heating.",jog_note:"Home first. The printer does not limit these moves.",busy_reason:"Moving and extruding are possible once the print is done.",changing_reason:"Wait until the filament change is done.",offline_reason:"The printer is offline.",detection:"Print options",detection_all_on:"All on",detection_off:"{off} off",detection_all_off:"All off",detection_hint:"On: the printer pauses the print when it sees the problem. Sensitivity as set on the printer. A detection switched off stays off for later prints too.",detection_ai_monitoring:"AI print monitoring",detection_ai_monitoring_x1:"Spaghetti and purge chute pile-ups",detection_first_layer_inspection:"First layer inspection",detection_build_plate_detection:"Build plate detection",detection_build_plate_position_detection:"Build plate position detection",detection_spaghetti_detection:"Spaghetti detection",detection_pileup_detection:"Purge chute pile-up detection",detection_clumping_detection:"Nozzle clumping detection",detection_air_printing_detection:"Air printing detection",external:"External spool",externals:"External spools",left:"Left",right:"Right",humidity:"Humidity",temperature:"Temperature",empty:"Empty",not_set:"Not set",unknown:"Unknown",filament_offline:"Contents unknown while the printer is offline.",in_use:"In use",load:"Load",unload:"Unload",load_title:"Load {filament}?",load_text:"The printer heats the nozzle, unloads the current filament and loads this one. This takes a few minutes.",unload_title:"Unload the filament?",unload_text:"The printer heats the nozzle and pulls the filament back.",ht_load:"Load filament from the AMS HT on the printer's screen.",filament_pause:"Pause the print to change the filament.",paused_change:"The print stays paused. Resume it once the new filament is in.",drying:"Drying \xB7 {time} left",drying_now:"Drying",not_drying:"Not drying",dry:"Dry",dry_stop:"Stop drying",dry_title:"Dry the filament in {unit}",dry_temperature:"Temperature",dry_duration:"Duration",dry_start:"Start drying",dry_suggested:"Suggested for the loaded filament.",dry_mixed:"Set for the gentlest spool: {spools}",decrease:"Less {what}",increase:"More {what}",set_filament:"Set filament",set_filament_external:"Set filament of the external spool",set_filament_left:"Set filament of the left external spool",set_filament_right:"Set filament of the right external spool",slot_label:"Slot {slot} \xB7 {unit}",filament_title:"Filament of {slot}",filament_title_external:"Filament of the external spool",filament_title_left:"Filament of the left external spool",filament_title_right:"Filament of the right external spool",material:"Material",material_keep:"Keep {name}",material_choose:"Choose \u2026",color:"Color",color_other:"Other color \u2026",color_current:"Current color",color_chosen:"Chosen color",color_white:"White",color_black:"Black",color_gray:"Gray",color_silver:"Silver",color_red:"Red",color_orange:"Orange",color_yellow:"Yellow",color_green:"Green",color_turquoise:"Turquoise",color_cyan:"Cyan",color_blue:"Blue",color_purple:"Purple",color_pink:"Pink",color_brown:"Brown",color_beige:"Beige",color_gold:"Gold",filament_note:"For spools without a chip. A new material uses Bambu's generic profile and the default K value.",filament_set:"Set",filament_need_material:"Choose a material too.",dur_min:"{m} min",dur_h:"{h} h",dur_hm:"{h} h {m} min",dur_dh:"{d} d {h} h",hours:"h"};var wt={en:yt,de:_t},Vn=n=>n in wt,$t="en",On=n=>{let t=n.toLowerCase().replace(/[-_].*$/,"");return Vn(t)?t:"en"};function kt(n){let t=n??document.querySelector("home-assistant")?.hass;return t?On(t.locale.language):$t}function Ct(n){$t=kt(n)}function s(n,t,e={}){return wt[kt(n)][t].replace(/\{(\w+)\}/g,(i,r)=>r in e?String(e[r]):i)}async function At(n,t,e,i){await n.callService(t,e,i,void 0,!1)}async function Fe(n,t){let e=typeof t=="object"&&t!==null?t:{},i=e.translation_domain,r=e.translation_key;if(i&&r)try{let a=(await n.loadBackendTranslation("exceptions",i))(`component.${i}.exceptions.${r}.message`,e.translation_placeholders??{});if(a)return a}catch{}return typeof e.message=="string"&&e.message?e.message:s(n,"error_generic")}async function Lt(n,t){let r=(await n.callService("bambuddy","get_print_objects",{device_id:t},void 0,!1,!0))?.response?.objects;return(Array.isArray(r)?r:[]).filter(o=>typeof o=="object"&&o!==null&&typeof o.id=="number").map(o=>({id:o.id,name:typeof o.name=="string"?o.name:"",skipped:o.skipped===!0}))}var St=new Set(["unavailable","unknown"]),b=(n,t)=>t?n.states[t]:void 0;function H(n,t){let e=b(n,t);return!!e&&!St.has(e.state)}function y(n,t){let e=b(n,t);if(!e||e.state.trim()==="")return;let i=Number(e.state);return Number.isFinite(i)?i:void 0}function L(n,t,e){let i=b(n,t);if(!(!i||e===void 0&&St.has(i.state)))return e===void 0?n.formatEntityState(i):n.formatEntityState(i,e)}function Nn(n){switch(n.locale.number_format){case"comma_decimal":return"en-US";case"decimal_comma":return"de";case"space_comma":return"fr";case"quote_decimal":return"de-CH";case"system":return;default:return n.locale.language}}function z(n,t,e=0){return new Intl.NumberFormat(Nn(n),{maximumFractionDigits:e,useGrouping:n.locale.number_format!=="none"}).format(t)}var S=(n,t)=>`${z(n,t)}\xA0\xB0C`,R=(n,t)=>`${z(n,t)}\xA0%`;function ce(n,t){let e=Math.max(0,Math.round(t)),i=Math.floor(e/1440),r=Math.floor(e%1440/60),o=e%60;return i>0?s(n,"dur_dh",{d:i,h:r}):r===0?s(n,"dur_min",{m:o}):o===0?s(n,"dur_h",{h:r}):s(n,"dur_hm",{h:r,m:o})}function Pn(n){switch(n.locale.time_format){case"12":return!0;case"24":return!1;case"system":return new Intl.DateTimeFormat(void 0,{hour:"numeric"}).resolvedOptions().hour12;default:return}}function Fn(n){return n.locale.time_zone==="server"?n.config?.time_zone:void 0}function Tt(n,t,e=new Date){let i=new Date(t);if(Number.isNaN(i.getTime()))return;let r=Fn(n),o=n.locale.language,a=d=>new Intl.DateTimeFormat("en-CA",{timeZone:r,dateStyle:"short"}).format(d),l=a(i)===a(e);return new Intl.DateTimeFormat(o,{timeZone:r,hour:"numeric",minute:"2-digit",hour12:Pn(n),...l?{}:{weekday:"short"}}).format(i)}var U=new Set(["printing","paused","preparing","slicing"]),Ht=new Set(["printing","preparing","slicing"]),zt=new Set(["heating","feeding","retracting","verifying","purging","changing_filament"]),ue=new Set(["printing","paused","preparing","slicing","finished","failed"]);function me(n){switch(n){case"printing":case"preparing":case"slicing":return"active";case"paused":return"paused";case"finished":return"done";case"failed":return"failed";case"idle":return"idle";default:return"off"}}function Et(n){return typeof n=="string"&&/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(n)?n.slice(0,7):void 0}function In(n){let[t,e,i]=[1,3,5].map(r=>parseInt(n.slice(r,r+2),16)/255);return .2126*t+.7152*e+.0722*i}function fe(n){let t=In(n);return t>.85||t<.12}var jn={pause:"M14,19H18V5H14M6,19H10V5H6V19Z",play:"M8,5.14V19.14L19,12.14L8,5.14Z",stop:"M18,18H6V6H18V18Z",lightOn:"M12,6A6,6 0 0,1 18,12C18,14.22 16.79,16.16 15,17.2V19A1,1 0 0,1 14,20H10A1,1 0 0,1 9,19V17.2C7.21,16.16 6,14.22 6,12A6,6 0 0,1 12,6M14,21V22A1,1 0 0,1 13,23H11A1,1 0 0,1 10,22V21H14M20,11H23V13H20V11M1,11H4V13H1V11M13,1V4H11V1H13M4.92,3.5L7.05,5.64L5.63,7.05L3.5,4.93L4.92,3.5M16.95,5.63L19.07,3.5L20.5,4.93L18.37,7.05L16.95,5.63Z",lightOff:"M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21M12,4A5,5 0 0,0 7,9C7,11.05 8.23,12.81 10,13.58V16H14V13.58C15.77,12.81 17,11.05 17,9A5,5 0 0,0 12,4Z",nozzle:"M7,2H17V8H19V13H16.5L13,17H11L7.5,13H5V8H7V2M10,22H2V20H10A1,1 0 0,0 11,19V18H13V19A3,3 0 0,1 10,22Z",bed:"M7.95,3L6.53,5.19L7.95,7.4H7.94L5.95,10.5L4.22,9.6L5.64,7.39L4.22,5.19L6.22,2.09L7.95,3M13.95,2.89L12.53,5.1L13.95,7.3L13.94,7.31L11.95,10.4L10.22,9.5L11.64,7.3L10.22,5.1L12.22,2L13.95,2.89M20,2.89L18.56,5.1L20,7.3V7.31L18,10.4L16.25,9.5L17.67,7.3L16.25,5.1L18.25,2L20,2.89M2,22V14A2,2 0 0,1 4,12H20A2,2 0 0,1 22,14V22H20V20H4V22H2M6,14A1,1 0 0,0 5,15V17A1,1 0 0,0 6,18A1,1 0 0,0 7,17V15A1,1 0 0,0 6,14M10,14A1,1 0 0,0 9,15V17A1,1 0 0,0 10,18A1,1 0 0,0 11,17V15A1,1 0 0,0 10,14M14,14A1,1 0 0,0 13,15V17A1,1 0 0,0 14,18A1,1 0 0,0 15,17V15A1,1 0 0,0 14,14M18,14A1,1 0 0,0 17,15V17A1,1 0 0,0 18,18A1,1 0 0,0 19,17V15A1,1 0 0,0 18,14Z",chamber:"M15 13V5A3 3 0 0 0 9 5V13A5 5 0 1 0 15 13M12 4A1 1 0 0 1 13 5V8H11V5A1 1 0 0 1 12 4Z",fan:"M12,11A1,1 0 0,0 11,12A1,1 0 0,0 12,13A1,1 0 0,0 13,12A1,1 0 0,0 12,11M12.5,2C17,2 17.11,5.57 14.75,6.75C13.76,7.24 13.32,8.29 13.13,9.22C13.61,9.42 14.03,9.73 14.35,10.13C18.05,8.13 22.03,8.92 22.03,12.5C22.03,17 18.46,17.1 17.28,14.73C16.78,13.74 15.72,13.3 14.79,13.11C14.59,13.59 14.28,14 13.88,14.34C15.87,18.03 15.08,22 11.5,22C7,22 6.91,18.42 9.27,17.24C10.25,16.75 10.69,15.71 10.89,14.79C10.4,14.59 9.97,14.27 9.65,13.87C5.96,15.85 2,15.07 2,11.5C2,7 5.56,6.89 6.74,9.26C7.24,10.25 8.29,10.68 9.22,10.87C9.41,10.39 9.73,9.97 10.14,9.65C8.15,5.96 8.94,2 12.5,2Z",home:"M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z",up:"M13,20H11V8L5.5,13.5L4.08,12.08L12,4.16L19.92,12.08L18.5,13.5L13,8V20Z",down:"M11,4H13V16L18.5,10.5L19.92,11.92L12,19.84L4.08,11.92L5.5,10.5L11,16V4Z",left:"M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z",right:"M4,11V13H16L10.5,18.5L11.92,19.92L19.84,12L11.92,4.08L10.5,5.5L16,11H4Z",chevronRight:"M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z",chevronDown:"M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z",humidity:"M12,3.25C12,3.25 6,10 6,14C6,17.32 8.69,20 12,20A6,6 0 0,0 18,14C18,10 12,3.25 12,3.25M14.47,9.97L15.53,11.03L9.53,17.03L8.47,15.97M9.75,10A1.25,1.25 0 0,1 11,11.25A1.25,1.25 0 0,1 9.75,12.5A1.25,1.25 0 0,1 8.5,11.25A1.25,1.25 0 0,1 9.75,10M14.25,14.5A1.25,1.25 0 0,1 15.5,15.75A1.25,1.25 0 0,1 14.25,17A1.25,1.25 0 0,1 13,15.75A1.25,1.25 0 0,1 14.25,14.5Z",error:"M13 13H11V7H13M11 15H13V17H11M15.73 3H8.27L3 8.27V15.73L8.27 21H15.73L21 15.73V8.27L15.73 3Z",warning:"M13 14H11V9H13M13 18H11V16H13M1 21H23L12 2L1 21Z",info:"M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",close:"M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z",video:"M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z",videoOff:"M3.27,2L2,3.27L4.73,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16C16.2,18 16.39,17.92 16.54,17.82L19.73,21L21,19.73M21,6.5L17,10.5V7A1,1 0 0,0 16,6H9.82L21,17.18V6.5Z",load:"M2 12H4V17H20V12H22V17C22 18.11 21.11 19 20 19H4C2.9 19 2 18.11 2 17V12M12 15L17.55 9.54L16.13 8.13L13 11.25V2H11V11.25L7.88 8.13L6.46 9.55L12 15Z",unload:"M2 12H4V17H20V12H22V17C22 18.11 21.11 19 20 19H4C2.9 19 2 18.11 2 17V12M12 2L6.46 7.46L7.88 8.88L11 5.75V15H13V5.75L16.13 8.88L17.55 7.45L12 2Z",speed:"M12,16A3,3 0 0,1 9,13C9,11.88 9.61,10.9 10.5,10.39L20.21,4.77L14.68,14.35C14.18,15.33 13.17,16 12,16M12,3C13.81,3 15.5,3.5 16.97,4.32L14.87,5.53C14,5.19 13,5 12,5A8,8 0 0,0 4,13C4,15.21 4.89,17.21 6.34,18.65H6.35C6.74,19.04 6.74,19.67 6.35,20.06C5.96,20.45 5.32,20.45 4.93,20.07V20.07C3.12,18.26 2,15.76 2,13A10,10 0 0,1 12,3M22,13C22,15.76 20.88,18.26 19.07,20.07V20.07C18.68,20.45 18.05,20.45 17.66,20.06C17.27,19.67 17.27,19.04 17.66,18.65V18.65C19.11,17.2 20,15.21 20,13C20,12 19.81,11 19.46,10.1L20.67,8C21.5,9.5 22,11.18 22,13Z",check:"M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z",skip:"M16,18H18V6H16M6,18L14.5,12L6,6V18Z",sync:"M12,18A6,6 0 0,1 6,12C6,11 6.25,10.03 6.7,9.2L5.24,7.74C4.46,8.97 4,10.43 4,12A8,8 0 0,0 12,20V23L16,19L12,15M12,4V1L8,5L12,9V6A6,6 0 0,1 18,12C18,13 17.75,13.97 17.3,14.8L18.76,16.26C19.54,15.03 20,13.57 20,12A8,8 0 0,0 12,4Z",power:"M16.56,5.44L15.11,6.89C16.84,7.94 18,9.83 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12C6,9.83 7.16,7.94 8.88,6.88L7.44,5.44C5.36,6.88 4,9.28 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,9.28 18.64,6.88 16.56,5.44M13,3H11V13H13",snow:"M20.79,13.95L18.46,14.57L16.46,13.44V10.56L18.46,9.43L20.79,10.05L21.31,8.12L19.54,7.65L20,5.88L18.07,5.36L17.45,7.69L15.45,8.82L13,7.4V5.11L14.71,3.4L13.29,2L12,3.29L10.71,2L9.29,3.4L11,5.11V7.4L8.5,8.82L6.5,7.69L5.92,5.36L4,5.88L4.47,7.65L2.7,8.12L3.22,10.05L5.55,9.43L7.55,10.56V13.45L5.55,14.58L3.22,13.96L2.7,15.89L4.47,16.36L4,18.12L5.93,18.64L6.55,16.31L8.55,15.18L11,16.6V18.89L9.29,20.6L10.71,22L12,20.71L13.29,22L14.7,20.6L13,18.89V16.6L15.5,15.17L17.5,16.3L18.12,18.63L20,18.12L19.53,16.35L21.3,15.88L20.79,13.95M9.5,10.56L12,9.11L14.5,10.56V13.44L12,14.89L9.5,13.44V10.56Z",heat:"M8.5 4.5L5.4 9.5L8.5 14.7L5.2 20.5L3.4 19.6L6.1 14.7L3 9.5L6.7 3.6L8.5 4.5M14.7 4.4L11.6 9.5L14.7 14.5L11.4 20.3L9.6 19.4L12.3 14.5L9.2 9.5L12.9 3.5L14.7 4.4M21 4.4L17.9 9.5L21 14.5L17.7 20.3L15.9 19.4L18.6 14.5L15.5 9.5L19.2 3.5L21 4.4",layers:"M12,16L19.36,10.27L21,9L12,2L3,9L4.63,10.27M12,18.54L4.62,12.81L3,14.07L12,21.07L21,14.07L19.37,12.8L12,18.54Z",timer:"M12,20A7,7 0 0,1 5,13A7,7 0 0,1 12,6A7,7 0 0,1 19,13A7,7 0 0,1 12,20M19.03,7.39L20.45,5.97C20,5.46 19.55,5 19.04,4.56L17.62,6C16.07,4.74 14.12,4 12,4A9,9 0 0,0 3,13A9,9 0 0,0 12,22C17,22 21,17.97 21,13C21,10.88 20.26,8.93 19.03,7.39M11,14H13V8H11M15,1H9V3H15V1Z",clock:"M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z",pencil:"M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z",palette:"M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z",eye:"M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z",minus:"M19,13H5V11H19V13Z",plus:"M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z",offline:"M2.28,3L1,4.27L2.47,5.74C2.04,6 1.61,6.29 1.2,6.6L3,9C3.53,8.6 4.08,8.25 4.66,7.93L6.89,10.16C6.15,10.5 5.44,10.91 4.8,11.4L6.6,13.8C7.38,13.22 8.26,12.77 9.2,12.47L11.75,15C10.5,15.07 9.34,15.5 8.4,16.2L12,21L14.46,17.73L17.74,21L19,19.72M12,3C9.85,3 7.8,3.38 5.9,4.07L8.29,6.47C9.5,6.16 10.72,6 12,6C15.38,6 18.5,7.11 21,9L22.8,6.6C19.79,4.34 16.06,3 12,3M12,9C11.62,9 11.25,9 10.88,9.05L14.07,12.25C15.29,12.53 16.43,13.07 17.4,13.8L19.2,11.4C17.2,9.89 14.7,9 12,9Z",dotsVertical:"M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z",wifi:"M12,21L15.6,16.2C14.6,15.45 13.35,15 12,15C10.65,15 9.4,15.45 8.4,16.2L12,21M12,3C7.95,3 4.21,4.34 1.2,6.6L3,9C5.5,7.12 8.62,6 12,6C15.38,6 18.5,7.12 21,9L22.8,6.6C19.79,4.34 16.05,3 12,3M12,9C9.3,9 6.81,9.89 4.8,11.4L6.6,13.8C8.1,12.67 9.97,12 12,12C14.03,12 15.9,12.67 17.4,13.8L19.2,11.4C17.19,9.89 14.7,9 12,9Z",ethernet:"M7,15H9V18H11V15H13V18H15V15H17V18H18V9H15V6H9V9H6V18H7V15M4.38,3H19.63C20.94,3 22,4.06 22,5.38V19.63A2.37,2.37 0 0,1 19.63,22H4.38C3.06,22 2,20.94 2,19.63V5.38C2,4.06 3.06,3 4.38,3Z",shieldCheck:"M10,17L6,13L7.41,11.59L10,14.17L16.59,7.58L18,9M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z",shieldAlert:"M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M11,7H13V13H11V7M11,15H13V17H11V15Z",download:"M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z",memory:"M17,17H7V7H17M21,11V9H19V7C19,5.89 18.1,5 17,5H15V3H13V5H11V3H9V5H7C5.89,5 5,5.89 5,7V9H3V11H5V13H3V15H5V17A2,2 0 0,0 7,19H9V21H11V19H13V21H15V19H17A2,2 0 0,0 19,17V15H21V13H19V11M13,13H11V11H13M15,9H9V15H15V9Z",copy:"M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z",refresh:"M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z",infoOutline:"M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z",openInNew:"M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z"},h=n=>Ne`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d=${jn[n]}></path></svg>`,Mt=()=>Ne`<svg class="drawing" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
  <rect class="d-body" x="14" y="10" width="92" height="100" rx="10"></rect>
  <rect class="d-window" x="24" y="20" width="72" height="66" rx="5"></rect>
  <line class="d-line" x1="28" y1="36" x2="92" y2="36"></line>
  <path class="d-head" d="M52 31h16v11h-4l-4 5-4-5h-4z"></path>
  <rect class="d-part" x="50" y="64" width="20" height="12" rx="2"></rect>
  <line class="d-line" x1="32" y1="77" x2="88" y2="77"></line>
  <rect class="d-base" x="24" y="92" width="72" height="8" rx="3"></rect>
</svg>`;function w(n){let{label:t,iconName:e,onClick:i,kind:r="tonal",disabled:o=!1,pending:a=!1,iconOnly:l=!1,aria:d,className:u=""}=n;return c`<button
    class="btn ${r} ${l?"icon-only":""} ${a?"pending":""} ${u}"
    ?disabled=${o||a}
    aria-busy=${a?"true":"false"}
    aria-label=${d??t}
    title=${d??t}
    @click=${i}
  >
    ${h(e)}${l?p:c`<span>${t}</span>`}
  </button>`}function A(n,t="info"){return c`<div class="note ${t}">${h(t==="info"?"info":"warning")}<span>${n}</span></div>`}function Z(n){let{hass:t,refs:e}=n;return!n.canControl||!n.online||b(t,e.developerMode)?.state!=="off"?p:A(s(t,"developer_off"),"warning")}function he(n,t,e){let i=b(n.hass,t)?.attributes.friendly_name;if(typeof i!="string")return e;let r=`${n.refs.name} `;return(i.startsWith(r)?i.slice(r.length):i).trim()||e}var Ie=["left","right"];function te(n){let t=Ie.indexOf(b(n.hass,n.refs.activeNozzle)?.state??"");return n.refs.dual&&t>=0?t:void 0}var Bn=new Set(["idle","unknown","unavailable",""]);function ge(n){let{hass:t,refs:e}=n,i=b(t,e.amsStatus)?.state;if(!(!n.online||i===void 0||Bn.has(i)))return s(t,"ams_activity",{state:L(t,e.amsStatus)})}function N(n,t){let e=b(n,t),i=!H(n,t),r=i?{}:e.attributes,o=d=>typeof d=="string"?d:"",a=r.remaining,l=!i&&(r.empty===!0||e?.state==="empty");return{entityId:t,name:l||i?"":o(r.name)||(e?.state??""),type:o(r.type),color:Et(r.color),...typeof a=="number"&&a>=0?{remaining:a}:{},active:r.active===!0,empty:l,unknown:i,rfid:r.rfid===!0,present:r.present===!0}}function be(n,t="small"){let e=n.color??"var(--bb-muted)",i=n.remaining??100,r=n.color!==void 0&&fe(n.color),o=!n.empty&&i<100;return c`<span
    class="swatch ${t} ${n.empty?"empty":""} ${n.unknown?"unknown":""} ${n.active?"active":""} ${r?"outline":""} ${o?"partial":""}"
    style="--c: ${e}; --fill: ${Math.max(6,Math.min(100,i))}%"
    aria-hidden="true"
    ><span class="fill"></span
  ></span>`}var je=(n,t)=>s(n,t.present?"not_set":"empty");function Be(n,t){if(t.unknown)return s(n,"unknown");if(t.empty)return je(n,t);let e=t.remaining===void 0?"":` \xB7 ${R(n,t.remaining)}`;return`${t.name||t.type}${e}`}function Kn(n,t){return t==="ai_monitoring"&&/^X1/i.test(n.refs.model)?s(n.hass,"detection_ai_monitoring_x1"):void 0}function Un(n,t,e){let{hass:i}=n,r=he(n,e,s(i,`detection_${t}`)),o=Kn(n,t),a=`det-sub-${t}`,l=c`<span class="det-text">
    <span class="det-name">${r}</span>
    ${o?c`<span class="det-sub" id=${a}>${o}</span>`:p}
  </span>`;if(!H(i,e))return c`<div class="det-row unknown">${l}<span class="det-state">${s(i,"unknown")}</span></div>`;let d=n.switchOn(e),u=n.isPending(`switch_${e}`);return c`<div class="det-row">
    ${l}
    <button
      class="det-switch"
      role="switch"
      aria-label=${r}
      aria-describedby=${o?a:p}
      aria-checked=${d?"true":"false"}
      aria-busy=${u?"true":"false"}
      ?disabled=${!n.online||u}
      @click=${()=>n.toggleSwitch(e)}
    >
      <span class="toggle" aria-hidden="true"><span class="knob"></span></span>
    </button>
  </div>`}function Dt(n){let{hass:t,refs:e}=n;if(!e.detectors.length)return p;let i=e.detectors.filter(({entityId:l})=>H(t,l)),r=i.filter(({entityId:l})=>!n.switchOn(l)).length,o=r===0?s(t,"detection_all_on"):r===i.length?s(t,"detection_all_off"):s(t,"detection_off",{off:r}),a=n.optionsOpen;return c`<section class="detection">
    <button class="det-head" aria-expanded=${a?"true":"false"} aria-controls=${a?"det-body":p} @click=${()=>n.toggleOptions()}>
      <span class="section-label" id="det-title">${h("eye")}${s(t,"detection")}</span>
      ${i.length?c`<span class="det-summary ${r?"warn":""}">${o}</span>`:p}
      <span class="det-chevron ${a?"open":""}" aria-hidden="true">${h("chevronDown")}</span>
    </button>
    ${a?c`<div class="det-body" id="det-body" role="region" aria-labelledby="det-title">
          <div class="det-rows">${e.detectors.map(({key:l,entityId:d})=>Un(n,l,d))}</div>
          <p class="hint">${s(t,"detection_hint")}</p>
        </div>`:p}
  </section>`}var W=5,Rt={nozzle:220,bed:55,chamber:40},Zn={nozzle:320,bed:140,chamber:65};function Wn(n){let{hass:t,refs:e}=n,i=e.dual?["nozzle_left","nozzle_right"]:["nozzle"],r=te(n);return[...e.nozzles.map((a,l)=>[s(t,i[l]),a,"nozzle",l===r]),[s(t,"bed"),e.bed,"bed",!1],[s(t,"chamber"),e.chamber,"chamber",!1]].flatMap(([a,l,d,u])=>l.target?[{label:a,kind:d,target:l.target,active:u,...l.sensor?{sensor:l.sensor}:{}}]:[])}var Gn=n=>Math.round(n/W)*W;function qn(n){let t=b(n.hass,n.refs.activeFilament)?.attributes??{},e=t.nozzle_temp_min,i=t.nozzle_temp_max;return typeof e=="number"&&typeof i=="number"&&i>=e&&e>0?Gn((e+i)/2):Rt.nozzle}function Yn(n,t,e){let{hass:i}=n,r=n.targetOf(t.target),o=y(i,t.sensor),a=b(i,t.target)?.attributes.max,l=typeof a=="number"?a:Zn[t.kind],d=r===void 0||r<=0,u=Math.min(l,t.kind==="nozzle"?qn(n):Rt[t.kind]),m=d?u:Math.min(l,r+W),f=d?0:Math.max(0,r-W),g=t.label;return c`<div class="heat-row">
    <div class="heat-name">
      <span class="heat-label"
        >${h(t.kind)}<span class="heat-title"
          ><span class="heat-text">${t.label}</span> ${t.active?c`<span class="heat-tag">${s(i,"nozzle_active")}</span>`:p}</span
        ></span
      >
      <span class="heat-now">${o===void 0?"\u2014":s(i,"heat_now",{value:S(i,o)})}</span>
    </div>
    <div class="heat-set">
      ${w({label:s(i,"heat_lower",{what:g,step:W}),iconName:"minus",iconOnly:!0,disabled:e.disabled||d,onClick:()=>n.stepTarget(t.target,f)})}
      <span class="heat-target ${d?"off":""}">${r===void 0?"\u2014":d?s(i,"heater_off"):S(i,r)}</span>
      ${w({label:d?s(i,"heat_start",{what:g,value:S(i,u)}):s(i,"heat_raise",{what:g,step:W}),iconName:"plus",iconOnly:!0,disabled:e.disabled||!d&&r>=l,onClick:()=>n.stepTarget(t.target,m)})}
    </div>
    ${e.offered?w({label:s(i,"heat_off",{what:g}),iconName:"power",iconOnly:!0,kind:"plain",className:"heat-off",disabled:e.disabled||d||n.changing,onClick:()=>n.setTargets([[t.target,0]])}):p}
  </div>`}function Vt(n){let{hass:t}=n,e=Wn(n);if(!e.length)return p;let i=!n.online,r=!n.busy,o=e.filter(a=>(n.targetOf(a.target)??0)>0);return c`<section class="heating" aria-labelledby="heat-title">
    <div class="heat-head">
      <span class="section-label" id="heat-title">${h("heat")}${s(t,"heating")}</span>
      ${r?w({label:s(t,"cool_down"),iconName:"snow",kind:"plain",disabled:i||!o.length||n.changing,onClick:()=>n.setTargets(o.map(a=>[a.target,0]))}):p}
    </div>
    <div class="heat-rows">${e.map(a=>Yn(n,a,{disabled:i,offered:r}))}</div>
  </section>`}var Xn=[1,10],Ke=10,Jn=170,Qn=["cold_nozzle_left","cold_nozzle_right"];function ei(n,t){let{hass:e,refs:i}=n,r=b(e,i.activeNozzle);if(!r)return p;let o=r.attributes.options,a=Array.isArray(o)&&o.length&&o.every(d=>typeof d=="string")?o:Ie,l=n.isPending("active_nozzle");return c`<div class="nozzle-row">
    <span class="step-label">${s(e,"active_nozzle")}</span>
    <div class="seg" role="radiogroup" aria-label=${s(e,"active_nozzle")}>
      ${a.map(d=>c`<button
          role="radio"
          aria-checked=${d===r.state?"true":"false"}
          ?disabled=${t||l||r.state==="unavailable"}
          @click=${()=>n.run("active_nozzle","select","select_option",{entity_id:i.activeNozzle,option:d})}
        >
          ${L(e,i.activeNozzle,d)}
        </button>`)}
    </div>
  </div>`}function ti(n){let{hass:t,refs:e}=n,i=te(n);if(i!==void 0)return y(t,e.nozzles[i].sensor);let r=e.nozzles.map(o=>y(t,o.sensor)).filter(o=>o!==void 0);return r.length?Math.max(...r):void 0}function Ot(n,t,e){let{hass:i,refs:r}=n;if(!n.canControl)return A(s(i,"read_only"));let o=!n.online||n.busy||n.changing,a=r.deviceId,l=x=>`${x>0?"+":"\u2212"}${z(i,Math.abs(x))}`,d=(x,M,_,T)=>{let oe=M*t,se=`move_${x}`;return w({label:s(i,"move",{axis:x.toUpperCase(),distance:l(oe)}),iconName:_,iconOnly:!0,disabled:o,pending:n.isPending(se),className:`jog ${T}`,onClick:()=>n.run(se,"bambuddy","move_axis",{device_id:a,axis:x,distance:oe})})},u=x=>w({label:s(i,x>0?"bed_away":"bed_closer"),aria:s(i,x>0?"bed_away_aria":"bed_closer_aria",{step:t}),iconName:x>0?"down":"up",disabled:o,pending:n.isPending("move_z"),className:"stack",onClick:()=>n.run("move_z","bambuddy","move_axis",{device_id:a,axis:"z",distance:x*t})}),m=ti(n),f=m!==void 0&&m<Jn,g=te(n),v=g===void 0?"cold_nozzle":Qn[g],C=x=>w({label:s(i,x>0?"extrude":"retract"),aria:s(i,x>0?"extrude_aria":"retract_aria",{length:Ke}),iconName:x>0?"down":"up",disabled:o||f,pending:n.isPending("extrude"),className:"stack",onClick:()=>n.run("extrude","bambuddy","extrude",{device_id:a,distance:x*Ke})}),E=w({label:s(i,"home"),iconName:"home",iconOnly:!0,kind:o?"tonal":"primary",disabled:o,pending:n.isPending("home"),className:"jog home",onClick:()=>n.confirm({title:s(i,"home_title"),text:s(i,"home_text"),confirm:s(i,"home"),action:["bambuddy","home_axes",{device_id:a}],key:"home"})});return c`${Z(n)}${n.online?p:A(s(i,"offline_reason"),"warning")} ${Vt(n)} ${Dt(n)}
    ${n.online&&n.busy?A(s(i,"busy_reason"),"warning"):n.changing?A(s(i,"changing_reason"),"warning"):p}
    ${ei(n,o)}
    <div class="control">
      <div class="step-row">
        <span class="step-label">${s(i,"step")}</span>
        <div class="seg" role="radiogroup" aria-label=${s(i,"step")}>
          ${Xn.map(x=>c`<button role="radio" aria-checked=${x===t?"true":"false"} @click=${()=>e(x)}>
              ${z(i,x)} mm
            </button>`)}
        </div>
        ${n.startLive?w({label:s(i,"live"),iconName:"video",iconOnly:!0,onClick:n.startLive}):p}
      </div>
      <div class="pad">
        ${d("y",1,"up","n")}${d("x",-1,"left","w")}${E}${d("x",1,"right","e")}${d("y",-1,"down","s")}
      </div>
      <div class="axis-col bed">
        <span class="axis-label">${s(i,"bed_axis")}</span>
        ${u(-1)}${u(1)}
      </div>
      <div class="axis-col ext">
        <span class="axis-label">${s(i,"extruder")} · ${z(i,Ke)} mm</span>
        <div class="ext-buttons">${C(-1)}${C(1)}</div>
      </div>
    </div>
    ${f&&!o?A(s(i,v)):p}
    <p class="hint">${s(i,"jog_note")}</p>`}var ve=["tap","always","off"],Ue=["show_temperatures","show_fans","show_ams","show_controls"],Nt=["ai_monitoring","first_layer_inspection","build_plate_detection","build_plate_position_detection","spaghetti_detection","pileup_detection","clumping_detection","air_printing_detection"];var Ze="bambuddy",We=n=>n.slice(0,n.indexOf(".")),Pt=new WeakMap;function ne(n){let t=Pt.get(n.entities);if(t)return t;let e=new Map;for(let i of Object.values(n.entities)){if(!i||i.platform!==Ze||!i.device_id)continue;let r=e.get(i.device_id)??[];r.push(i),e.set(i.device_id,r)}return Pt.set(n.entities,e),e}function jt(n){let t=new Map;for(let e of n){if(!e.translation_key)continue;let i=`${We(e.entity_id)}.${e.translation_key}`;t.set(i,[...t.get(i)??[],e.entity_id])}return t}var ni="sensor.print_status";function xe(n,t){return t?(ne(n).get(t)??[]).some(e=>e.translation_key==="print_status"&&We(e.entity_id)==="sensor"):!1}function Bt(n,t){let e=(ne(n).get(t)??[]).find(i=>i.translation_key==="print_status"&&We(i.entity_id)==="sensor");return e?n.states[e.entity_id]?.state:void 0}function Kt(n){return Object.values(n.devices).filter(t=>!!t&&xe(n,t.id))}var ie=n=>n.name_by_user||n.name||"";function Ft(n){let t=n?n.lastIndexOf(" ("):-1;return t>0?n.slice(0,t):void 0}function ii(n,t){let e=ie(n);if(n.name_by_user)return e;let i=[t.name,t.name_by_user,Ft(t.name)].find(o=>o&&e.startsWith(`${o} `)),r=i?e.slice(i.length+1):e;return r.endsWith(")")?Ft(r)??r:r}function Ut(n,t,e){let i=n.states[t]?.attributes[e];return typeof i=="number"?i:void 0}function ri(n,t){let e=i=>Ut(n,i,"slot")??Number.MAX_SAFE_INTEGER;return[...t].sort((i,r)=>e(i)-e(r))}function It(n,t){let e=t.slots.map(i=>Ut(n,i,"tray_id")).filter(i=>i!==void 0);return e.length?Math.min(...e):Number.MAX_SAFE_INTEGER}function oi(n,t){let e=ne(n),i=[];for(let r of Object.values(n.devices)){if(!r||r.via_device_id!==t.id)continue;let o=jt(e.get(r.id)??[]),a=o.get("sensor.ams_slot");if(!a)continue;let l=d=>o.get(d)?.[0];i.push({deviceId:r.id,name:ii(r,t),model:r.model??"",humidity:l("sensor.ams_humidity"),temperature:l("sensor.ams_temperature"),slots:ri(n,a),drying:l("binary_sensor.drying"),dryingRemaining:l("sensor.drying_remaining_time")})}return i.sort((r,o)=>It(n,r)-It(n,o)||r.name.localeCompare(o.name))}var si={"fan.part_cooling_fan":"part","fan.auxiliary_fan":"aux","fan.chamber_fan":"chamber","fan.exhaust_fan":"exhaust","fan.left_auxiliary_fan":"left_aux"};function Zt(n,t){let e=t?n.devices[t]:void 0;if(!e)return;let i=ne(n).get(e.id)??[],r=jt(i),o=_=>r.get(_)?.[0],a=o(ni);if(!a)return;let l=r.has("sensor.left_nozzle_temperature"),d=l?[{sensor:o("sensor.left_nozzle_temperature"),target:o("number.left_nozzle_target_temperature")},{sensor:o("sensor.right_nozzle_temperature"),target:o("number.right_nozzle_target_temperature")}]:[{sensor:o("sensor.nozzle_temperature"),target:o("number.nozzle_target_temperature")}],u=l?[o("sensor.left_external_spool"),o("sensor.right_external_spool")]:[o("sensor.external_spool")],m=Object.entries(si).map(([_,T])=>({key:T,entityId:o(_)})).filter(_=>_.entityId!==void 0),f=Nt.map(_=>({key:_,entityId:o(`switch.${_}`)})).filter(_=>_.entityId!==void 0),g=o("binary_sensor.online"),v=oi(n,e),E=g!==void 0&&n.states[g]?.state==="on"?v.filter(_=>_.slots.some(T=>n.states[T]?.state!=="unavailable")):v,x=l?["left_","right_"]:[""],M=_=>x.map(T=>o(`sensor.${T}${_}`));return{deviceId:e.id,name:ie(e),model:e.model??"",status:a,stage:o("sensor.print_stage"),progress:o("sensor.progress"),remaining:o("sensor.remaining_time"),endTime:o("sensor.end_time"),layer:o("sensor.current_layer"),totalLayers:o("sensor.total_layers"),job:o("sensor.current_print"),nozzles:d,dual:l,bed:{sensor:o("sensor.bed_temperature"),target:o("number.bed_target_temperature")},chamber:{sensor:o("sensor.chamber_temperature"),target:o("number.chamber_target_temperature")},hotendFan:o("sensor.hotend_fan"),hms:o("sensor.hms_errors"),activeFilament:o("sensor.active_filament"),externalSpools:u.filter(_=>_!==void 0),online:g,plateClearNeeded:o("binary_sensor.plate_clear_needed"),developerMode:o("binary_sensor.developer_mode"),amsStatus:o("sensor.ams_status"),activeNozzle:o("select.active_nozzle"),pause:o("button.pause"),resume:o("button.resume"),stop:o("button.stop"),plateCleared:o("button.plate_cleared"),clearHms:o("button.clear_hms_errors"),speed:o("select.print_speed"),fans:m,detectors:f,light:o("light.chamber_light"),camera:o("camera.camera"),cover:o("image.cover"),refresh:o("button.refresh_status"),printHours:o("sensor.print_hours"),wifiSignal:o("sensor.wifi_signal"),wiredNetwork:o("binary_sensor.wired_network"),ipAddress:o("sensor.ip_address"),firmware:o("update.firmware"),nozzleDiameters:M("nozzle_diameter"),nozzleTypes:M("nozzle_type"),ams:E,watched:[...i.map(_=>_.entity_id),...v.flatMap(_=>(ne(n).get(_.deviceId)??[]).map(T=>T.entity_id))]}}function ye(n,t,e){let i=b(n.hass,t)?.attributes[e];return typeof i=="string"&&i?i:void 0}var Wt=n=>ye(n,n.refs.status,"bambuddy_name")??n.refs.name,Gt=(n,t)=>{let e=y(n.hass,t);return e===void 0?void 0:z(n.hass,e,2)};function ai(n){let{hass:t,refs:e}=n,i=e.nozzleDiameters.map(l=>Gt(n,l)),r=i.filter(l=>l!==void 0);if(!r.length)return;if(new Set(r).size===1)return`${r[0]}\xA0mm`;let[o,a]=i;return`${s(t,"side_left_short")} ${o??"\u2014"} / ${s(t,"side_right_short")} ${a??"\u2014"}\xA0mm`}function qt(n){let{hass:t,refs:e}=n,i=y(t,e.printHours);if(i!==void 0)return typeof t.formatEntityState=="function"?t.formatEntityState(b(t,e.printHours)):s(t,"dur_h",{h:z(t,Math.round(i))})}var Yt=n=>[n.refs.model,ai(n),qt(n)].filter(Boolean).join(" \xB7 "),Xt=["error","warning","unknown","notice"];function li(n){let t=typeof n=="string"?n.replace(/^0x/i,"").toUpperCase():"";return/^[0-9A-F]{8}([0-9A-F]{8})?$/.test(t)?t.match(/.{4}/g).join("_"):t}var we=n=>typeof n.severity=="string"&&Xt.includes(n.severity)?n.severity:"unknown",Jt={error:"error",warning:"warning",unknown:"warning",notice:"info"},Ge=n=>n==="unknown"?"warning":n,Qt={error:"err",warning:"warn",notice:"info"};function qe(n){let t=e=>Xt.indexOf(we(e));return[...n].sort((e,i)=>t(e)-t(i))}function $e(n){let t=b(n.hass,n.refs.hms)?.attributes.errors,e=Array.isArray(t)?t:[],i=y(n.hass,n.refs.hms)??(Array.isArray(t)?e.length:void 0);return i===void 0?{errors:e}:{count:i,errors:e}}var Ye=n=>!!n.refs.clearHms&&n.canControl&&($e(n).count??0)>0,di=n=>n>=-60?"ok":n>=-75?"warn":"err",pi=(n,t)=>`${z(n.hass,t).replace(/^-/,"\u2212")}\xA0dBm`;function en(n){let{hass:t,refs:e}=n;if(!n.online)return;if(b(t,e.wiredNetwork)?.state==="on")return{tone:"neutral",iconName:"ethernet",text:s(t,"lan"),entityId:e.wiredNetwork};let i=y(t,e.wifiSignal);if(i===void 0)return;let r=pi(n,i);return{tone:di(i),iconName:"wifi",text:r,aria:s(t,"wifi_signal",{value:r}),entityId:e.wifiSignal}}function ci(n){let t=en(n);if(!t)return p;let e=c`${h(t.iconName)}<span>${t.text}</span>`;return c`<button
    class="pill network tone-${t.tone}"
    aria-label=${t.aria??t.text}
    aria-live="off"
    @click=${()=>n.moreInfo(t.entityId)}
  >
    ${e}
  </button>`}function ui(n,t){let{hass:e}=n,{count:i,errors:r}=$e(n);if(!n.online||i===void 0)return p;let o=qe(r)[0],a=i>0?Qt[Ge(o?we(o):"unknown")]:"ok",l=i>0?s(e,"hms_pill_aria",{count:i}):s(e,"hms_pill_none");return c`<button class="pill hms tone-${a}" aria-label=${l} title=${l} @click=${()=>t("hms")}>
    ${h(i>0?"shieldAlert":"shieldCheck")}<span>${i>0?s(e,"hms_pill",{count:i}):s(e,"hms_ok")}</span>
  </button>`}function Xe(n){let{refs:t}=n,e=b(n.hass,t.firmware);if(!e)return;let i=ye(n,t.firmware,"installed_version"),r=ye(n,t.firmware,"latest_version");return{...i?{installed:i}:{},...r?{latest:r}:{},update:e.state==="on",current:e.state==="off"}}function mi(n,t){let{hass:e}=n,i=Xe(n);if(!i||!i.installed&&!i.update)return p;let[r,o,a]=i.update?["warn","download","firmware_update"]:!n.online&&i.installed?["neutral","memory","firmware_offline"]:i.current?["ok","check","firmware_current"]:["neutral","memory","firmware_version"],l=i.installed??s(e,"firmware"),d=i.installed?s(e,a,{version:i.installed}):l;return c`<button class="pill firmware tone-${r}" aria-label=${d} title=${d} @click=${()=>t("firmware")}>
    ${h(o)}<span>${l}</span>
  </button>`}var fi=new Set(["paused","failed"]);function hi(n,t){let{hass:e}=n,{count:i,errors:r}=$e(n);if(!n.online||!i)return p;let o=qe(r),a=o[0],l=a?we(a):"unknown";if(l!=="error"&&!fi.has(n.status))return p;let d=typeof a?.description=="string"&&a.description?a.description:void 0,u=a?d??s(e,`hms_${l}`):s(e,"hms_count",{count:i}),m=o.length-1;return c`<button class="hms-line tone-${Qt[Ge(l)]}" title=${u} @click=${()=>t("hms")}>
    ${h(Jt[l])}<span class="hms-line-text">${u}</span>${m>0?c`<span class="hms-line-more">${s(e,"hms_more",{n:m})}</span>`:p}<span class="hms-line-go">${h("chevronRight")}</span>
  </button>`}function tn(n,t){let e=[ci(n),ui(n,t),mi(n,t)].filter(i=>i!==p);return e.length?c`<div class="pills" aria-live="polite">${e}</div>${hi(n,t)}`:p}function nn(n){let{hass:t}=n,{count:e=0,errors:i}=$e(n),r=qe(i),o=r.length?c`<div class="hms-list">
        ${r.map(a=>{let l=we(a),d=li(a.code),u=typeof a.description=="string"&&a.description?a.description:void 0;return c`<div class="hms-item sev-${Ge(l)}">
            ${h(Jt[l])}
            <div class="hms-body">
              <span class="hms-text">${u??s(t,`hms_${l}`)}</span>
              ${d?c`<span class="hms-code">${d}</span>`:p}
            </div>
          </div>`})}
      </div>`:c`<p class="hms-empty">${e>0?s(t,"hms_count",{count:e}):s(t,"hms_none")}</p>`;return c`<h2 id="dlg-title">${s(t,"hms_title")}</h2>
    ${o}
    ${Ye(n)?c`<p class="dlg-note">${h("info")}<span>${s(t,"hms_clear_note")}</span></p>`:p}`}function k(n,t,e=p,i=""){return c`<div class="spec-row">
    <span class="spec-label">${n}</span>
    <span class="spec-value ${i}">${t}</span>
    ${e}
  </div>`}function rn(n,t){let{hass:e}=n,i=Xe(n)??{update:!1,current:!1},r=()=>{t(),n.moreInfo(n.refs.firmware)};return c`<h2 id="dlg-title">${s(e,"firmware")}</h2>
    <div class="spec">
      ${i.installed?k(s(e,"firmware_installed"),i.installed):p}
      ${i.latest?k(s(e,i.update?"firmware_available":"firmware_latest"),i.latest,p,i.update?"update":""):p}
    </div>
    ${i.update?c`<button class="btn release" @click=${r}>${h("openInNew")}<span>${s(e,"firmware_notes")}</span></button>`:p}
    <p class="dlg-note">${h("info")}<span>${s(e,"firmware_note")}</span></p>`}var gi=()=>typeof navigator.clipboard?.writeText=="function";function bi(n){let{hass:t,refs:e}=n;return e.nozzles.map((i,r)=>{let o=Gt(n,e.nozzleDiameters[r]),a=e.nozzleTypes[r],l=[o===void 0?void 0:`${o}\xA0mm`,H(t,a)?L(t,a):void 0].filter(Boolean).join(" \xB7 ");return l&&e.dual?s(t,"nozzle_side",{side:s(t,r===0?"left":"right"),nozzle:l}):l}).filter(Boolean)}var _e=(n,t)=>c`<span class="chip tone-${n}">${t}</span>`;function vi(n,t){let{hass:e,refs:i}=n;if(!t.length)return p;let r=i.nozzles.length,o=r===1?s(e,"nozzle_count_one"):s(e,"nozzle_count",{count:r});return i.dual?k(s(e,"info_nozzles"),c`<span>${o}</span>
      ${t.map(a=>c`<span class="spec-sub">${a}</span> `)}`,p,"lines"):k(s(e,"info_nozzles"),[o,...t].join(" \xB7 "))}function on(n,t,e){let{hass:i,refs:r}=n,o=(x,M)=>gi()?c`<button class="icon-btn copy" aria-label=${s(i,x)} title=${s(i,x)} @click=${()=>e(M)}>${h("copy")}</button>`:p,a=ye(n,r.status,"bambuddy_name"),l=H(i,r.ipAddress)?b(i,r.ipAddress)?.state:void 0,d=i.devices[r.deviceId],u=d?.serial_number||void 0,m=d?.via_device_id?i.devices[d.via_device_id]:void 0,f=n.online?en(n):void 0,g=H(i,r.developerMode)?b(i,r.developerMode)?.state==="on":void 0,v=bi(n),C=qt(n),E=Xe(n)?.installed;return c`<h2 id="dlg-title">${s(i,"menu_info")}</h2>
    <div class="spec">
      ${r.model?k(s(i,"info_model"),r.model):p}
      ${a?k(s(i,"info_name"),a):p}
      ${m&&ie(m)?k(s(i,"info_server"),ie(m)):p}
      ${k(s(i,"info_status"),n.online?_e("ok",s(i,"online")):_e("off",s(i,"offline")))}
      ${k(s(i,"info_print_status"),L(i,r.status,n.status)??n.status)}
      ${l?k(s(i,"info_ip"),l,o("copy_ip",l)):p}
      ${u?k(s(i,"info_serial"),u,o("copy_serial",u)):p}
      ${f?k(s(i,"info_network"),f.iconName==="wifi"?`${s(i,"wifi")} \xB7 ${f.text}`:f.text):p}
      ${E?k(s(i,"firmware"),E):p}
      ${g===void 0?p:g?k(s(i,"info_developer"),_e("ok",s(i,"info_on"))):k(s(i,"info_developer"),c`${_e("warn",s(i,"info_off"))} <span class="spec-sub">${s(i,"info_developer_note")}</span>`,p,"lines")}
      ${vi(n,v)}
      ${C?k(s(i,"info_hours"),C):p}
    </div>
    ${t?c`<div class="dlg-snack"><div class="sent" role="status">${h("check")}<span>${s(i,"copied")}</span></div></div>`:p}`}var $={temperature:55,duration:8,minTemperature:45,maxTemperature:85,maxTemperatureAms2Pro:65,minDuration:1,maxDuration:24},xi=["PLA","PLA Silk","PLA-CF","PETG","PETG HF","PETG-CF","PCTG","ABS","ASA","PC","PA","PA-CF","TPU"],re="keep",ln=[{color:"#FFFFFF",name:"color_white"},{color:"#000000",name:"color_black"},{color:"#8E9089",name:"color_gray"},{color:"#A6A9AA",name:"color_silver"},{color:"#C12E1F",name:"color_red"},{color:"#FF6A13",name:"color_orange"},{color:"#F4EE2A",name:"color_yellow"},{color:"#00AE42",name:"color_green"},{color:"#00A6A0",name:"color_turquoise"},{color:"#0086D6",name:"color_cyan"},{color:"#0A2989",name:"color_blue"},{color:"#5E43B7",name:"color_purple"},{color:"#F55A74",name:"color_pink"},{color:"#9D432C",name:"color_brown"},{color:"#F7E6DE",name:"color_beige"},{color:"#E4BD68",name:"color_gold"}],Je=n=>ln.some(t=>t.color===n);function Qe(n){let t=n.material!==void 0&&n.material!==re?{material:n.material}:{},e=n.color,i=e!==void 0&&e!==n.current;return{...t,...i?{color:[1,3,5].map(r=>parseInt(e.slice(r,r+2),16))}:{}}}function sn(n,t,e){let{label:i,field:r,value:o,unit:a,min:l,max:d,step:u}=e,m=`dry-${r}`;return c`<div class="field">
    <label for=${m}>${i}</label>
    <div class="stepper">
      <button class="btn icon-only" aria-label=${s(n,"decrease",{what:i})} ?disabled=${o<=l} @click=${()=>t.setDrying(r,o-u)}>
        ${h("minus")}
      </button>
      <input
        id=${m}
        type="number"
        inputmode="numeric"
        min=${l}
        max=${d}
        .value=${String(o)}
        @change=${f=>{let g=f.target;g.value=String(t.setDrying(r,g.value.trim()===""?Number.NaN:Number(g.value)))}}
      />
      <span class="unit-text">${a}</span>
      <button class="btn icon-only" aria-label=${s(n,"increase",{what:i})} ?disabled=${o>=d} @click=${()=>t.setDrying(r,o+u)}>
        ${h("plus")}
      </button>
    </div>
  </div>`}function _i(n,t){if(t.differing.length){let e=t.differing.map(i=>`${i.material}\xA0${S(n,i.temperature)}`).join(" \xB7 ");return c`<p class="dlg-suggested mixed">${h("info")}<span>${s(n,"dry_mixed",{spools:e})}</span></p>`}return t.suggested?c`<p class="dlg-suggested">${h("check")}<span>${s(n,"dry_suggested")}</span></p>`:p}function yi(n,t,e){return c`<h2 id="dlg-title">${s(n,"dry_title",{unit:t.unit.name})}</h2>
    ${sn(n,e,{label:s(n,"dry_temperature"),field:"temperature",value:t.temperature,unit:"\xB0C",min:$.minTemperature,max:t.maxTemperature,step:5})}
    ${sn(n,e,{label:s(n,"dry_duration"),field:"duration",value:t.duration,unit:s(n,"hours"),min:$.minDuration,max:$.maxDuration,step:1})}
    ${_i(n,t)}
    <p class="dlg-range">
      ${S(n,$.minTemperature)} – ${S(n,t.maxTemperature)} · ${$.minDuration}–${$.maxDuration}
      ${s(n,"hours")}
    </p>`}var dn=n=>n.chosen.length>0&&n.objects.every(t=>t.skipped||n.chosen.includes(t.id));function wi(n,t,e){let i;return t.loading?i=c`<p role="status">${s(n,"skip_loading")}</p>`:t.error?i=c`<div class="dlg-error" role="alert">${h("error")}<span>${t.error}</span></div>`:t.objects.length?i=c`<div class="objects" role="group" aria-labelledby="dlg-title">
        ${t.objects.map(r=>c`<label class="obj ${r.skipped?"skipped":""}">
            <input
              type="checkbox"
              .checked=${t.chosen.includes(r.id)}
              ?disabled=${r.skipped}
              @change=${()=>e.toggleObject(r.id)}
            />
            <span class="obj-name">${r.name||s(n,"skip_object",{id:r.id})}</span>
            ${r.skipped?c`<span class="obj-note">${s(n,"skip_skipped")}</span>`:p}
          </label>`)}
      </div>
      <p class="dlg-warn">${h("warning")}<span>${s(n,dn(t)?"skip_all":"skip_text")}</span></p>`:i=c`<p>${s(n,"skip_none_listed")}</p>`,c`<h2 id="dlg-title">${s(n,"skip")}</h2>
    ${i}`}function an(n,t,e,i,r){return c`<button
    class="pal ${fe(e)?"outline":""}"
    role="radio"
    aria-checked=${n.color===e?"true":"false"}
    aria-label=${i}
    title=${i}
    tabindex=${r?0:-1}
    style="--c: ${e}"
    @click=${()=>t.setColor(e)}
  ></button>`}function $i(n){let t=n.key==="ArrowRight"||n.key==="ArrowDown"?1:n.key==="ArrowLeft"||n.key==="ArrowUp"?-1:0,e=[...n.currentTarget.querySelectorAll("[role=radio]")],i=e.indexOf(n.target);if(!t||i<0)return;n.preventDefault();let r=e[(i+t+e.length)%e.length];r.focus(),r.click()}function ki(n,t,e){let i=ln.map(l=>({color:l.color,label:s(n,l.name)})),r=t.custom?{color:t.custom,label:s(n,t.custom===t.current?"color_current":"color_chosen")}:void 0,o=Math.max(0,[...i,...r?[r]:[]].findIndex(l=>l.color===t.color)),a=l=>e.pickColor(l.target.value);return c`<h2 id="dlg-title">${t.title}</h2>
    <div class="field">
      <label for="fil-material">${s(n,"material")}</label>
      <span class="select">
        <select id="fil-material" class=${t.material===void 0?"unset":""} @change=${l=>e.setMaterial(l.target.value)}>
          ${t.keep===void 0?c`<option value="" disabled .selected=${t.material===void 0}>${s(n,"material_choose")}</option>`:c`<option value=${re} .selected=${t.material===re}>${s(n,"material_keep",{name:t.keep})}</option>`}
          ${xi.map(l=>c`<option value=${l} .selected=${t.material===l}>${l}</option>`)}
        </select>
        ${h("chevronDown")}
      </span>
    </div>
    <div class="colors">
      <span class="field-label">${s(n,"color")}</span>
      <div class="palette" role="radiogroup" aria-label=${s(n,"color")} @keydown=${$i}>
        <div class="swatches">${i.map((l,d)=>an(t,e,l.color,l.label,d===o))}</div>
        <div class="other-row">
          ${r?an(t,e,r.color,r.label,o===i.length):p}
          <label class="btn plain other-color"
            >${h("palette")}<span>${s(n,"color_other")}</span
            ><input type="color" .value=${(t.color??t.custom??"#FFFFFF").toLowerCase()} @input=${a} @change=${a}
          /></label>
        </div>
      </div>
    </div>
    <p class="dlg-note">${h("info")}<span>${s(n,"filament_note")}</span></p>`}function Ci(n,t){let{hass:e}=n;switch(t.kind){case"confirm":return{keep:t.keep??s(e,"back"),confirm:t.confirm,danger:t.danger===!0,ready:!0};case"drying":return{keep:s(e,"back"),confirm:s(e,"dry_start"),danger:!1,ready:!0};case"filament":return{keep:s(e,"back"),confirm:s(e,"filament_set"),danger:!1,ready:t.material!==void 0&&Object.keys(Qe(t)).length>0,...t.material===void 0&&t.color!==void 0?{need:s(e,"filament_need_material")}:{}};case"hms":return{keep:s(e,"dismiss"),...Ye(n)?{confirm:s(e,"hms_clear")}:{},danger:!1,ready:!0};case"firmware":case"info":return{keep:s(e,"dismiss"),danger:!1,ready:!1};case"skip":{if(!t.loading&&(t.error||!t.objects.length))return{keep:s(e,"dismiss"),danger:!0,ready:!1};let i=t.chosen.length,r=i===0?s(e,"skip"):i===1?s(e,"skip_one"):s(e,"skip_many",{count:i});return{keep:s(e,"skip_keep"),confirm:r,danger:!0,ready:i>0&&!dn(t)}}}}function Ai(n,t,e){let{hass:i}=n;switch(t.kind){case"confirm":return c`<h2 id="dlg-title">${t.title}</h2>
        <p>${t.text}</p>
        ${t.note?c`<p class="dlg-note">${h("info")}<span>${t.note}</span></p>`:p}`;case"drying":return yi(i,t,e);case"filament":return ki(i,t,e);case"skip":return wi(i,t,e);case"hms":return nn(n);case"firmware":return rn(n,e.close);case"info":return on(n,t.copied===!0,e.copy)}}function pn(n,t,e){let{keep:i,confirm:r,danger:o,ready:a,need:l}=Ci(n,t),d=u=>{u.target===u.currentTarget&&e.close()};return c`<dialog aria-labelledby="dlg-title" @close=${e.close} @click=${d}>
    <div class="dlg-body">
      ${Ai(n,t,e)}
      <div class="dlg-actions">
        ${l?c`<span class="dlg-need">${l}</span>`:p}
        <button class="btn plain safe" autofocus @click=${e.close}>${i}</button>
        ${r===void 0?p:c`<button class="btn ${o?"danger":"primary"}" ?disabled=${!a} @click=${e.confirm}>${r}</button>`}
      </div>
    </div>
  </dialog>`}var Li="AMS HT",Si=["filament_title_left","filament_title_right"],Ti=["set_filament_left","set_filament_right"];function Hi(n,t,e,i){return!n.canControl||!n.online||!t.present||t.rfid||n.running&&t.active?p:w({label:i,iconName:"pencil",iconOnly:!0,kind:"plain",className:"edit",disabled:n.changing,pending:n.isPending(`filament_${t.entityId}`),onClick:()=>n.setFilament(t,e)})}function cn(n,t,e){let{hass:i,refs:r}=n,o=t.unknown?"\u2014":t.empty?je(i,t):t.name||t.type,a=t.name.toLowerCase().includes(t.type.toLowerCase()),l=t.active?c`<span class="in-use">${s(i,"in_use")}</span>`:void 0,d=[e.side??"",t.empty||!t.name||a?"":t.type,t.empty||t.remaining===void 0?"":R(i,t.remaining)].filter(Boolean),u=n.status==="paused"?{note:s(i,"paused_change")}:{},m=p;return n.canControl&&t.active?m=w({label:s(i,"unload"),iconName:"unload",disabled:!e.canAct,pending:n.isPending("unload"),onClick:()=>n.confirm({title:s(i,"unload_title"),text:s(i,"unload_text"),confirm:s(i,"unload"),...u,action:["bambuddy","unload_filament",{device_id:r.deviceId}],key:"unload"})}):n.canControl&&!t.empty&&!t.unknown&&e.canLoad&&(m=w({label:s(i,"load"),iconName:"load",disabled:!e.canAct,pending:n.isPending(`load_${t.entityId}`),onClick:()=>n.confirm({title:s(i,"load_title",{filament:o}),text:s(i,"load_text"),confirm:s(i,"load"),...u,action:["bambuddy","load_filament",{entity_id:t.entityId}],key:`load_${t.entityId}`})})),c`<div class="slot ${t.active?"active":""}">
    <button class="slot-main" aria-label=${t.unknown?s(i,"unknown"):o} @click=${()=>n.moreInfo(t.entityId)}>
      ${be(t,"large")}
      <span class="slot-text">
        <span class="slot-name">${o}</span>
        ${d.length||l?c`<span class="slot-sub">${l}${l&&d.length?" \xB7 ":""}${d.join(" \xB7 ")}</span>`:p}
      </span>
    </button>
    ${Hi(n,t,e.title,e.editLabel??s(i,"set_filament"))} ${m}
  </div>`}var zi=["AMS 2 Pro","AMS HT"];function Ei(n,t){let{hass:e}=n;if(!t.drying||!zi.includes(t.model))return p;let i=b(e,t.drying)?.state==="on",r=y(e,t.dryingRemaining),o=i?r?s(e,"drying",{time:ce(e,r)}):s(e,"drying_now"):s(e,"not_drying"),a=`dry_${t.deviceId}`;return c`<div class="drying ${i?"on":""}">
    ${h("heat")}<span>${o}</span>
    ${n.canControl?i?w({label:s(e,"dry_stop"),iconName:"stop",kind:"plain",disabled:!n.online,pending:n.isPending(a),onClick:()=>n.run(a,"bambuddy","stop_drying",{device_id:t.deviceId})}):w({label:s(e,"dry"),iconName:"heat",kind:"plain",disabled:!n.online,pending:n.isPending(a),onClick:()=>n.dry(t)}):p}
  </div>`}function Mi(n,t,e){let{hass:i}=n,r=y(i,t.humidity),o=y(i,t.temperature),a=t.model===Li;return c`<section class="unit">
    <div class="unit-head">
      <span class="unit-name">${t.name}</span>
      ${t.model&&!t.name.includes(t.model)?c`<span class="unit-model">${t.model}</span>`:p}
      <span class="unit-env">
        ${r!==void 0?c`<span title=${s(i,"humidity")}>${h("humidity")}${R(i,r)}</span>`:p}
        ${o!==void 0?c`<span title=${s(i,"temperature")}>${h("chamber")}${S(i,o)}</span>`:p}
      </span>
    </div>
    ${Ei(n,t)}
    <div class="slots">
      ${t.slots.map((l,d)=>cn(n,N(i,l),{canAct:e,canLoad:!a,title:s(i,"filament_title",{slot:s(i,"slot_label",{slot:d+1,unit:t.name})})}))}
    </div>
    ${a&&n.canControl?c`<p class="hint">${s(i,"ht_load")}</p>`:p}
  </section>`}function un(n){let{hass:t,refs:e}=n,i=n.keyLacksControl?s(t,"read_only"):!n.canControl||!n.online?void 0:n.running?s(t,"filament_pause"):n.changing?s(t,"changing_reason"):void 0,r=n.canControl&&n.online&&!n.running&&!n.changing,o=e.externalSpools.length>1,a=ge(n);return c`${Z(n)}${i?A(i,n.keyLacksControl?"info":"warning"):p}
    ${n.online?p:A(s(t,"filament_offline"),"warning")}
    ${a?c`<div class="activity" role="status">${h("sync")}<span>${a}</span><span class="activity-bar" aria-hidden="true"></span></div>`:p}
    ${e.ams.map(l=>Mi(n,l,r))}
    ${e.externalSpools.length?c`<section class="unit">
          <div class="unit-head"><span class="unit-name">${s(t,o?"externals":"external")}</span></div>
          <div class="slots">
            ${e.externalSpools.map((l,d)=>cn(n,N(t,l),{canAct:r,canLoad:!0,title:s(t,o?Si[d]:"filament_title_external"),editLabel:s(t,o?Ti[d]:"set_filament_external"),...o?{side:s(t,d===0?"left":"right")}:{}}))}
          </div>
        </section>`:p}`}var Di={printer:{allowed:()=>s(void 0,"allowed_device"),check:n=>typeof n=="string"},camera:{allowed:()=>ve.join(", "),check:n=>typeof n=="string"&&ve.includes(n)},...Object.fromEntries(Ue.map(n=>[n,{allowed:()=>"true, false",check:t=>typeof t=="boolean"}]))};function et(n){if(n===null||typeof n!="object"||Array.isArray(n))throw new Error(s(void 0,"invalid_option",{option:"type",value:JSON.stringify(n),allowed:"custom:bambuddy-printer-card"}));let t=Object.fromEntries(Object.entries(n).filter(([,e])=>e!==null));for(let[e,i]of Object.entries(Di)){let r=t[e];if(r!==void 0&&!i.check(r))throw new Error(s(void 0,"invalid_option",{option:e,value:JSON.stringify(r),allowed:i.allowed()}))}return t}var mn={printer:"editor_printer",camera:"editor_camera",show_temperatures:"show_temperatures",show_fans:"show_fans",show_ams:"show_ams",show_controls:"show_controls"},fn={printer:"editor_printer_help",camera:"editor_camera_help"};function hn(){return{schema:[{name:"printer",required:!0,selector:{device:{filter:{integration:"bambuddy"},entity:{integration:"bambuddy",domain:"sensor",device_class:"enum"}}}},{name:"camera",default:"tap",selector:{select:{mode:"dropdown",options:ve.map(n=>({value:n,label:s(void 0,`camera_${n}`)}))}}},{name:"",type:"grid",schema:Ue.map(n=>({name:n,default:!0,selector:{boolean:{}}}))}],computeLabel:n=>n.name in mn?s(void 0,mn[n.name]):void 0,computeHelper:n=>n.name in fn?s(void 0,fn[n.name]):void 0,assertConfig:n=>{et(n)}}}var Ri=window.customElements,Vi=1e4;function Oi(n=()=>window.customElements,t=Ri,e=Vi){let i=Date.now();return new Promise(r=>{let o=()=>{let a=n();a!==t||a.get("home-assistant")||Date.now()-i>=e?r(a):setTimeout(o,50)};o()})}var Ni="https://github.com/Spegeli/hacs_bambuddy#-dashboard-card";function Pi(n,t,e){let i=n.entities[t];if(!i||i.platform!==Ze||!i.device_id)return null;let r=n.devices[i.device_id],o=xe(n,i.device_id)?i.device_id:r?.via_device_id;return!o||!xe(n,o)?null:{config:{type:`custom:${e}`,printer:o,camera:"tap"}}}function gn(n,t,e){Oi().then(r=>{r.get(n)||r.define(n,t)});let i=window;i.customCards??=[],!i.customCards.some(r=>r.type===n)&&i.customCards.push({type:n,get name(){return e.name()},get description(){return e.description()},preview:!0,documentationURL:Ni,getEntitySuggestion:(r,o)=>Pi(r,o,n)})}function bn(n){let{hass:t,refs:e}=n;return b(t,e.plateClearNeeded)?.state!=="on"?p:c`<div class="callout">
    ${h("info")}<span>${s(t,"plate_text")}</span>
    ${e.plateCleared&&n.canControl?w({label:s(t,"plate_cleared"),iconName:"check",kind:"primary",pending:n.isPending("plate"),onClick:()=>n.run("plate","button","press",{entity_id:e.plateCleared})}):p}
  </div>`}var Fi=n=>n.replace(/(\.gcode)?\.(3mf|gcode)$/i,"")||n,Ii=new Set(["idle","printing","unknown","unavailable"]);function ji(n,t){let{hass:e,refs:i,status:r}=n,o=me(r);if(!n.online)return c`<div class="job">${t}<div class="job-info">${A(s(e,"offline_text"),"warning")}</div></div>`;let a=ue.has(r),l=a?L(e,i.job):void 0,d=l===void 0?void 0:Fi(l),u=r==="finished"?100:y(e,i.progress),m=b(e,i.stage)?.state,f=a&&m&&!Ii.has(m)?L(e,i.stage):void 0,g=[],v=y(e,i.layer),C=y(e,i.totalLayers);a&&v&&C&&g.push(["layers",s(e,"layer",{current:v,total:C})]);let E=y(e,i.remaining);U.has(r)&&E&&g.push(["timer",s(e,"remaining",{time:ce(e,E)})]);let x=b(e,i.endTime)?.state,M=U.has(r)&&x?Tt(e,x):void 0;M&&g.push(["clock",s(e,"ends",{time:M})]);let _=a&&u!==void 0,T=ge(n);return c`<div class="job">
    ${t}
    <div class="job-info">
      <div class="job-top">
        <span class="job-name" title=${d??""}>${d??s(e,"no_job")}</span>
        ${_?c`<span class="pct tone-${o}">${R(e,u)}</span>`:p}
      </div>
      ${f?c`<div class="stage">${f}</div>`:p}
      ${T?c`<div class="ams-activity" role="status">${h("sync")}<span>${T}</span></div>`:p}
      ${_?c`<div
            class="bar tone-${o}"
            role="progressbar"
            aria-label=${s(e,"progress")}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow=${u}
          >
            <span style="width: ${Math.max(0,Math.min(100,u))}%"></span>
          </div>`:p}
      ${g.length?c`<div class="meta">${g.map(([oe,se])=>c`<span>${h(oe)}${se}</span>`)}</div>`:p}
    </div>
  </div>`}function Bi(n,t,e,i){let{hass:r}=n,o=y(r,e.sensor),a=y(r,e.target),l=a!==void 0&&a>0&&o!==void 0&&a-o>3,d=o===void 0?"\u2014":S(r,o),u=a===void 0?void 0:a>0?s(r,"target",{value:S(r,a)}):s(r,"heater_off");return c`<button
    class="temp ${l?"heating":""}"
    aria-label=${[t,d,u].filter(Boolean).join(", ")}
    @click=${()=>n.moreInfo(e.target??e.sensor)}
  >
    <span class="temp-head">${h(l?"heat":i)}<span>${t}</span></span>
    <span class="temp-value">${d}</span>
    ${u?c`<span class="temp-target">${u}</span>`:p}
  </button>`}function Ki(n){let{hass:t,refs:e}=n,i=e.dual?["nozzle_left","nozzle_right"]:["nozzle"],o=[...e.nozzles.map((a,l)=>[s(t,i[l]),a,"nozzle"]),[s(t,"bed"),e.bed,"bed"],[s(t,"chamber"),e.chamber,"chamber"]].filter(([,a])=>a.sensor||a.target);return o.length?c`<div class="temps n${o.length} ${e.dual?"dual":""}">${o.map(([a,l,d])=>Bi(n,a,l,d))}</div>`:p}function Ui(n,t){let e=b(n.hass,t);if(!e||e.state!=="on"&&e.state!=="off")return;let i=e.attributes.percentage;return e.state==="off"?0:typeof i=="number"?i:100}function Zi(n){let{hass:t,refs:e}=n,i=e.fans.map(r=>[r.key,r.entityId,Ui(n,r.entityId)]);return e.hotendFan&&i.push(["hotend",e.hotendFan,y(t,e.hotendFan)]),i.length?c`<div class="fans" role="group" aria-label=${s(t,"fans")}>
    ${i.map(([r,o,a])=>{let l=s(t,`fan_${r}`),d=he(n,o,s(t,`fan_${r}_name`)),u=a===void 0?"\u2014":a>0?R(t,a):s(t,"fan_off");return c`<button class="fan ${a?"on":""}" aria-label="${d}: ${u}" title=${d} @click=${()=>n.moreInfo(o)}>
        ${h("fan")}<span class="fan-label short">${l}</span><span class="fan-label full">${d}</span><span class="fan-value">${u}</span>
      </button>`})}
  </div>`:p}function Wi(n){let{hass:t,refs:e}=n,i=[...e.ams.map(a=>({name:a.name,humidity:y(t,a.humidity),slots:a.slots})),...e.externalSpools.length?[{name:s(t,"external_short"),humidity:void 0,slots:e.externalSpools}]:[]];if(!i.length)return p;let r=e.externalSpools.length===2?[s(t,"side_left_short"),s(t,"side_right_short")]:[],o=a=>r[e.externalSpools.indexOf(a)];return c`<button class="ams-strip" aria-label=${s(t,"open_filament")} @click=${()=>n.show("filament")}>
    ${i.map(a=>c`<span class="ams-group">
        <span class="ams-head"
          ><span class="ams-name">${a.name}</span>${a.humidity!==void 0?c`<span class="ams-hum">${h("humidity")}${R(t,a.humidity)}</span>`:p}</span
        >
        <span class="ams-slots">
          ${a.slots.map(l=>{let d=N(t,l),u=o(l);return c`<span class="ams-slot" title=${u?`${u} \xB7 ${Be(t,d)}`:Be(t,d)}
              >${u?c`<span class="slot-side">${u}</span>`:p}${be(d)}<span class="slot-type"
                >${d.unknown?"\u2014":d.empty?"\u2013":d.type||"?"}</span
              ></span
            >`})}
        </span>
      </span>`)}
    <span class="ams-go">${h("chevronRight")}</span>
  </button>`}var Gi=["silent","standard","sport","ludicrous"];function qi(n){let t=/^(.+?)\s*\(([^)]+)\)\s*$/.exec(n);return t?[t[1],t[2]]:[n]}function Yi(n){let{hass:t,refs:e}=n,i=b(t,e.speed);if(!i)return p;let r=i.attributes.options,o=Array.isArray(r)&&r.every(l=>typeof l=="string")?r:Gi,a=n.isPending("speed");return c`<div class="speed">
    <span class="speed-label">${h("speed")}${s(t,"speed")}</span>
    <div class="seg speeds" role="radiogroup" aria-label=${s(t,"speed")}>
      ${o.map(l=>{let d=L(t,e.speed,l),[u,m]=qi(d);return c`<button
          role="radio"
          aria-checked=${l===i.state?"true":"false"}
          aria-label=${d}
          title=${d}
          ?disabled=${a||i.state==="unavailable"}
          @click=${()=>n.run("speed","select","select_option",{entity_id:e.speed,option:l})}
        >
          <span class="opt">${u}</span> ${m?c`<span class="opt-sub">${m}</span>`:p}
        </button>`})}
    </div>
  </div>`}function Xi(n){let{hass:t,refs:e}=n;return e.dual||b(t,e.activeFilament)?.state!=="none"?!1:![...e.ams.flatMap(r=>r.slots),...e.externalSpools].some(r=>N(t,r).active)}function Ji(n){let{hass:t,refs:e,status:i}=n;if(!n.online||!U.has(i))return p;if(!n.canControl)return A(s(t,"read_only"));let r=i==="paused",o=[r&&e.resume?w({label:s(t,"resume"),iconName:"play",kind:"primary",pending:n.isPending("resume"),onClick:()=>n.run("resume","button","press",{entity_id:e.resume})}):p,!r&&e.pause?w({label:s(t,"pause"),iconName:"pause",pending:n.isPending("pause"),onClick:()=>n.run("pause","button","press",{entity_id:e.pause})}):p,e.stop?w({label:s(t,"stop"),iconName:"stop",kind:"danger",pending:n.isPending("stop"),onClick:()=>n.confirm({title:s(t,"stop_title"),text:s(t,"stop_text"),confirm:s(t,"stop_confirm"),keep:s(t,"stop_keep"),danger:!0,action:["button","press",{entity_id:e.stop}],key:"stop"})}):p,i==="printing"||r?w({label:s(t,"skip"),iconName:"skip",kind:"plain",pending:n.isPending("skip"),className:"skip",onClick:n.skip}):p],a=r&&e.resume&&Xi(n)?A(s(t,"paused_empty"),"warning"):p;return c`<div class="controls">${a}<div class="ctl-buttons">${o}</div>${Yi(n)}</div>`}function vn(n,t){let{config:e}=n,i=n.online;return c`${i?bn(n):p}${ji(n,t)}${i?p:bn(n)}
  ${i&&e.show_temperatures!==!1?Ki(n):p}
  ${i&&e.show_fans!==!1?Zi(n):p}
  ${i&&e.show_ams!==!1?Wi(n):p}
  ${e.show_controls!==!1?c`${Z(n)}${Ji(n)}`:p}`}var xn=Ae`
  :host {
    container-type: inline-size;
    display: block;
    --bb-text: var(--primary-text-color, #212121);
    --bb-muted: var(--secondary-text-color, #727272);
    --bb-disabled: var(--disabled-text-color, #9e9e9e);
    --bb-accent: var(--primary-color, #03a9f4);
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
    --bb-radius: var(--ha-card-border-radius, 12px);
  }
  ha-card {
    display: block;
    position: relative;
    color: var(--bb-text);
    font-family: var(--ha-font-family-body, inherit);
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
    outline: 2px solid var(--bb-accent);
    outline-offset: 2px;
  }

  /* Header: online dot, name, status, light, menu; the chips below. */
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
  .model {
    font-size: 12px;
    color: var(--bb-muted);
    line-height: 16px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* Network, HMS, firmware: small chips that wrap; the icon carries the
     colour, the text stays readable. */
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: -2px 16px 10px 36px;
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
    white-space: nowrap;
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
    width: calc(100% - 52px);
    min-height: 32px;
    margin: -4px 16px 10px 36px;
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
  .menu [role="menuitem"]:hover,
  .menu [role="menuitem"]:focus-visible {
    background: var(--bb-tint);
    outline: none;
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
  @media (prefers-reduced-motion: reduce) {
    .menu {
      animation: none;
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
    color: var(--tone);
    background: color-mix(in srgb, var(--tone) 15%, transparent);
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

  /* Buttons. */
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
    color: var(--bb-accent);
    background: color-mix(in srgb, var(--bb-accent) 14%, transparent);
    transition: opacity 0.15s;
  }
  .btn.primary {
    color: var(--bb-on-accent);
    background: var(--bb-accent);
  }
  .btn.danger {
    color: var(--bb-err);
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
  .btn.icon-only {
    padding: 0;
    width: 36px;
  }
  .link {
    border: 0;
    padding: 0;
    background: none;
    color: inherit;
    font-size: 12px;
    text-decoration: underline;
    cursor: pointer;
    align-self: flex-start;
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
  .callout {
    display: flex;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 18px;
  }
  .callout .btn {
    margin: -4px -4px -4px 0;
    flex: none;
  }
  .callout {
    align-items: center;
    background: color-mix(in srgb, var(--bb-accent) 10%, transparent);
  }
  .callout > .icon {
    color: var(--bb-accent);
  }
  .callout > span {
    flex: 1;
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
  .pct {
    font-size: 22px;
    font-weight: 500;
    line-height: 24px;
    color: var(--tone);
    font-variant-numeric: tabular-nums;
  }
  .stage {
    font-size: 13px;
    color: var(--bb-muted);
    margin-top: -4px;
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
  .live-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.4px;
    color: #fff;
    background: rgba(219, 68, 55, 0.92);
  }
  .live .icon-btn {
    position: absolute;
    top: 6px;
    right: 6px;
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
  .slot-side {
    font-size: 10px;
    font-weight: 600;
    color: var(--bb-muted);
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
  }
  .temp-head span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .temp-head .icon {
    width: 15px;
    height: 15px;
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
  .temp.heating .temp-head .icon,
  .temp.heating .temp-target {
    color: var(--bb-heat);
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
  @media (prefers-reduced-motion: reduce) {
    .fan.on .icon,
    .ams-activity .icon,
    .activity .icon,
    .activity-bar,
    .sent {
      animation: none;
    }
    .bar span {
      transition: none;
    }
  }

  /* Filament: the strip on the status view. */
  .ams-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: 8px 18px;
    padding: 10px 40px 10px 12px;
    border: 0;
    border-radius: 10px;
    background: var(--bb-tint);
    text-align: left;
    cursor: pointer;
    position: relative;
  }
  .ams-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ams-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--bb-muted);
    white-space: nowrap;
  }
  .ams-name {
    font-weight: 500;
    color: var(--bb-text);
  }
  .ams-hum {
    display: inline-flex;
    align-items: center;
    gap: 1px;
  }
  .ams-hum .icon {
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
    outline: 2px solid var(--bb-accent);
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
    background: color-mix(in srgb, var(--bb-accent) 18%, transparent);
    color: var(--bb-accent);
    font-weight: 500;
  }
  .seg button:disabled {
    cursor: default;
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
  .seg.speeds .opt-sub {
    font-size: 11px;
    line-height: 14px;
    font-weight: 400;
    opacity: 0.8;
    font-variant-numeric: tabular-nums;
  }

  /* Control view: the heaters on top; the step, the pad beside the bed,
     the extruder below them -- beside them where there is room. */
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
    color: var(--bb-accent);
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
  .heat-set .btn.icon-only {
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
    width: 34px;
    min-height: 34px;
    color: var(--bb-muted);
  }
  .btn.heat-off:not(:disabled):hover {
    color: var(--bb-text);
  }
  /* The print options: folded under a head with the count of those on; a
     row per detection, only its switch taps. */
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
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .det-head:focus-visible {
    outline: 2px solid var(--bb-accent);
    outline-offset: 2px;
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
  .det-summary.warn {
    color: var(--bb-warn);
    font-weight: 500;
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
  .det-state {
    flex: none;
    font-size: 13px;
    color: var(--bb-muted);
  }
  .detection .hint {
    margin-top: 4px;
  }
  @media (prefers-reduced-motion: reduce) {
    .det-chevron,
    .toggle,
    .toggle .knob {
      transition: none;
    }
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
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 10px;
  }
  .unit-name {
    font-weight: 500;
    font-size: 15px;
  }
  .unit-model {
    font-size: 12px;
    color: var(--bb-muted);
    padding: 1px 8px;
    border-radius: 10px;
    background: var(--bb-tint);
  }
  .unit-env {
    margin-left: auto;
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
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--bb-muted);
    min-height: 32px;
  }
  .drying > span {
    flex: 1;
  }
  .drying.on {
    color: var(--bb-text);
  }
  .drying.on > .icon {
    color: var(--bb-heat);
  }
  .slots {
    display: grid;
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
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .slot-sub {
    font-size: 12px;
    color: var(--bb-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .slot-sub .in-use {
    font-weight: 500;
    color: var(--bb-accent);
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
    color: var(--bb-accent);
  }
  .ams-activity .icon,
  .activity .icon {
    width: 15px;
    height: 15px;
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
  .activity .icon {
    color: var(--bb-accent);
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

  /* Dialogs. */
  dialog {
    border: 0;
    padding: 0;
    border-radius: 16px;
    max-width: min(360px, calc(100vw - 32px));
    width: 100%;
    color: var(--bb-text);
    background: var(--ha-card-background, var(--card-background-color, #fff));
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.45);
  }
  .dlg-body {
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
  .dlg-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
  .dlg-actions .btn.danger {
    color: #fff;
    background: var(--bb-err);
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
  }
  .sev-error {
    --sev: var(--bb-err);
  }
  .sev-notice {
    --sev: var(--bb-info);
  }
  .hms-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: min(50vh, 360px);
    overflow-y: auto;
  }
  .hms-item {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    border-radius: 10px;
    font-size: 14px;
    line-height: 20px;
    background: color-mix(in srgb, var(--sev) 12%, transparent);
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
    color: var(--bb-warn);
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
  /* "Copied", inside the dialog: the card's own snackbar lies behind it. */
  .dlg-body {
    position: relative;
  }
  .dlg-snack {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 15px;
    height: 0;
  }
  .objects {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: min(50vh, 320px);
    overflow-y: auto;
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
    background: var(--ha-card-background, var(--card-background-color, #fff));
    cursor: pointer;
    text-overflow: ellipsis;
  }
  /* The prompt to choose reads as one, not as a value. */
  .select select.unset {
    color: var(--bb-muted);
  }
  .select select:focus-visible {
    outline: 2px solid var(--bb-accent);
    outline-offset: 2px;
  }
  .select option {
    color: var(--bb-text);
    background: var(--ha-card-background, var(--card-background-color, #fff));
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
      0 0 0 2px var(--ha-card-background, var(--card-background-color, #fff)),
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
    outline: 2px solid var(--bb-accent);
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
  /* Very narrow: the speed names and the step label get the room. */
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

  @container (max-width: 340px) {
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
    .heat-set .btn.icon-only,
    .btn.heat-off {
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
`;var Qi="bambuddy-printer-card",er=["offline","unavailable","unknown"];var tr=12e3,_n=3e3,yn=800,wn=1e4,ke=(n,t,e)=>Math.min(e,Math.max(t,n)),tt=class extends O{constructor(){super(...arguments);this.preview=!1;this.view="status";this.liveWanted=!1;this.pageVisible=document.visibilityState!=="hidden";this.streamFailed=!1;this.pending=new Set;this.sent=!1;this.menuOpen=!1;this.step=1;this.drafts=new Map;this.optionsOpen=!1;this.draftTimers=new Map;this.attached=!1;this.dialogFromMenu=!1;this.onVisibility=()=>{this.pageVisible=document.visibilityState!=="hidden",this.pageVisible||this.stopStream()};this.onPointerDown=e=>{if(!this.menuOpen)return;let i=this.renderRoot.querySelector(".menu-wrap");i&&!e.composedPath().includes(i)&&(this.menuOpen=!1)};this.startLive=()=>{this.streamFailed=!1,this.liveWanted=!0};this.closeLive=()=>{this.stopStream(),this.liveWanted=!1,this.streamFailed=!1};this.streamBroke=()=>{this.stopStream(),this.streamFailed=!0};this.retryLive=()=>{this.streamFailed=!1};this.closeError=()=>{clearTimeout(this.errorTimer),this.error=void 0};this.closeDialog=()=>{this.endDialog()};this.confirmDialog=()=>{let e=this.dialog;if(this.endDialog(),!!e)if(e.kind==="confirm"){let[i,r,o]=e.action;this.run(e.key,i,r,o)}else e.kind==="hms"?this.run("clear_hms","button","press",{entity_id:this.refs?.clearHms}):e.kind==="skip"?this.run("skip","bambuddy","skip_objects",{device_id:this.refs?.deviceId,objects:e.chosen}):e.kind==="filament"?this.run(`filament_${e.entityId}`,"bambuddy","set_filament",{entity_id:e.entityId,...Qe(e)}):e.kind==="drying"&&this.run(`dry_${e.unit.deviceId}`,"bambuddy","start_drying",{device_id:e.unit.deviceId,temperature:e.temperature,duration:e.duration})};this.dialogActions={close:this.closeDialog,confirm:this.confirmDialog,setDrying:(e,i)=>this.setDrying(e,i),toggleObject:e=>this.toggleObject(e),setMaterial:e=>this.editFilament({material:e}),setColor:e=>this.editFilament({color:e}),pickColor:e=>this.pickColor(e),copy:e=>{this.copy(e)}};this.toggleMenu=()=>{this.menuOpen=!this.menuOpen};this.triggerKeys=e=>{e.key==="ArrowDown"&&(e.preventDefault(),this.menuOpen=!0)};this.menuKeys=e=>{if(e.key==="Escape"){e.preventDefault(),e.stopPropagation(),this.closeMenu(!0);return}if(e.key==="Tab"){this.menuOpen=!1;return}let i=this.menuItems().filter(a=>!a.disabled),r=i.indexOf(this.renderRoot.activeElement),o={ArrowDown:r+1,ArrowUp:r-1,Home:0,End:i.length-1};e.key in o&&(e.preventDefault(),i[(o[e.key]+i.length)%i.length]?.focus())}}static{this.properties={hass:{attribute:!1},preview:{type:Boolean},config:{state:!0},view:{state:!0},liveWanted:{state:!0},pageVisible:{state:!0},streamFailed:{state:!0},brokenCover:{state:!0},pending:{state:!0},error:{state:!0},sent:{state:!0},dialog:{state:!0},menuOpen:{state:!0},step:{state:!0},drafts:{state:!0},optionsOpen:{state:!0}}}static{this.styles=xn}static getConfigForm(){return hn()}static getStubConfig(e){let i=e?Kt(e):[],o=i.find(a=>e&&!er.includes(Bt(e,a.id)??"unavailable"))??i[0];return{...o?{printer:o.id}:{},camera:"tap"}}setConfig(e){this.config=et(e),this.view="status",this.liveWanted=!1,this.refs=void 0,this.dialog=void 0,this.dialogFromMenu=!1}getCardSize(){let e=this.config,i=4;return e?.show_temperatures!==!1&&(i+=2),e?.show_fans!==!1&&(i+=1),e?.show_ams!==!1&&(i+=2),e?.show_controls!==!1&&(i+=2),i}getGridOptions(){return{columns:12,min_columns:6,rows:"auto"}}connectedCallback(){super.connectedCallback(),this.attached=!0,document.addEventListener("visibilitychange",this.onVisibility),document.addEventListener("pointerdown",this.onPointerDown),this.requestUpdate()}disconnectedCallback(){this.attached=!1,document.removeEventListener("visibilitychange",this.onVisibility),document.removeEventListener("pointerdown",this.onPointerDown),this.menuOpen=!1,this.stopStream(),this.liveWanted=!1,clearTimeout(this.errorTimer),this.error=void 0,clearTimeout(this.sentTimer),this.sent=!1,clearTimeout(this.copiedTimer),this.dialog?.kind==="info"&&(this.dialog={kind:"info"});for(let[e,i]of this.drafts)i.sentFrom===void 0&&this.sendTarget(e);super.disconnectedCallback()}shouldUpdate(e){if(e.size!==1||!e.has("hass"))return!0;let i=e.get("hass"),r=this.hass;return!i||!r||!this.refs||i.entities!==r.entities||i.devices!==r.devices||i.locale!==r.locale||i.localize!==r.localize?!0:this.refs.watched.some(o=>i.states[o]!==r.states[o])}willUpdate(e){let i=this.hass;if(!(!i||!this.config)){Ct(i),(!this.refs||e.has("config")||i.entities!==this.seenEntities||i.devices!==this.seenDevices)&&(this.seenEntities=i.entities,this.seenDevices=i.devices,this.refs=Zt(i,this.config.printer)),this.streaming()?this.streamSrc??=this.streamUrl():this.streamSrc=void 0;for(let[r,o]of this.drafts)o.sentFrom!==void 0&&i.states[r]?.state!==o.sentFrom&&this.dropDraft(r)}}updated(e){super.updated(e),e.has("menuOpen")&&this.menuOpen&&this.menuItems()[0]?.focus();let i=this.renderRoot.querySelector("dialog");i&&!i.open&&(typeof i.showModal=="function"?i.showModal():i.setAttribute("open",""),i.querySelector(".dlg-actions .safe")?.focus())}get cameraMode(){return this.config?.camera??"tap"}cameraToken(){let e=this.refs?.camera;if(!this.hass||!e||!H(this.hass,e))return;let i=b(this.hass,e)?.attributes.access_token;return typeof i=="string"&&i?i:void 0}streaming(){return this.cameraMode==="off"||this.preview||!this.attached||!this.pageVisible||!this.refs||!this.cameraToken()?!1:this.cameraMode==="always"||this.liveWanted}streamUrl(){return`/api/camera_proxy_stream/${this.refs?.camera}?token=${encodeURIComponent(this.cameraToken()??"")}`}stopStream(){for(let e of this.renderRoot.querySelectorAll("img.stream"))e.removeAttribute("src");this.streamSrc=void 0}canStartLive(e){return this.cameraMode==="tap"&&e&&!this.preview&&!this.liveWanted&&this.cameraToken()!==void 0}async run(e,i,r,o){let a=this.hass;if(!a||this.pending.has(e))return!1;this.pending=new Set([...this.pending,e]);try{return await At(a,i,r,o),this.showSent(),!0}catch(l){return this.showError(await Fe(a,l)),!1}finally{this.pending=new Set([...this.pending].filter(l=>l!==e))}}targetOf(e){return this.drafts.get(e)?.value??y(this.hass,e)}setDraft(e,i){this.drafts=new Map([...this.drafts,[e,i]])}dropDraft(e){clearTimeout(this.draftTimers.get(e)),this.draftTimers.delete(e);let i=new Map(this.drafts);i.delete(e),this.drafts=i}later(e,i,r){clearTimeout(this.draftTimers.get(e)),this.draftTimers.set(e,setTimeout(r,i))}stepTarget(e,i){this.setDraft(e,{value:i}),this.later(e,yn,()=>{this.sendTarget(e)})}async sendTarget(e){let i=this.hass,r=this.drafts.get(e),o=`target_${e}`;if(this.pending.has(o)){this.later(e,yn,()=>{this.sendTarget(e)});return}this.setDraft(e,{value:r.value,sentFrom:i.states[e]?.state??""}),this.later(e,wn,()=>this.dropDraft(e)),!await this.run(o,"number","set_value",{entity_id:e,value:r.value})&&this.drafts.get(e)?.sentFrom!==void 0&&this.dropDraft(e)}switchOn(e){let i=this.drafts.get(e);return i?i.value===1:b(this.hass,e).state==="on"}async toggleSwitch(e){let i=!this.switchOn(e);this.setDraft(e,{value:i?1:0,sentFrom:b(this.hass,e).state}),this.later(e,wn,()=>this.dropDraft(e)),await this.run(`switch_${e}`,"switch",i?"turn_on":"turn_off",{entity_id:e})||this.dropDraft(e)}setTargets(e){for(let[i,r]of e)this.setDraft(i,{value:r}),this.sendTarget(i)}showError(e){this.error=e,clearTimeout(this.errorTimer),this.errorTimer=setTimeout(()=>{this.error=void 0},tr)}showSent(){this.closeError(),this.sent=!0,clearTimeout(this.sentTimer),this.sentTimer=setTimeout(()=>{this.sent=!1},_n)}moreInfo(e){e&&this.dispatchEvent(new CustomEvent("hass-more-info",{bubbles:!0,composed:!0,detail:{entityId:e}}))}openDrying(e){let i=this.hass,r=e.model==="AMS 2 Pro"?$.maxTemperatureAms2Pro:$.maxTemperature,o=e.slots.map(f=>N(i,f)).filter(f=>!f.empty&&!f.unknown),a=(f,g)=>{let v=b(i,f.entityId).attributes[g];return typeof v=="number"&&v>0?Math.round(v):void 0},l=new Map;for(let f of o){let g=a(f,"drying_temp"),v=f.type||f.name;g!==void 0&&l.set(`${v} ${g}`,{material:v,temperature:g})}let d=[...l.values()].sort((f,g)=>f.temperature-g.temperature),u=d.map(f=>f.temperature),m=o.map(f=>a(f,"drying_time")).filter(f=>f!==void 0);this.dialog={kind:"drying",unit:e,temperature:ke(u[0]??$.temperature,$.minTemperature,r),duration:ke(m.length?Math.max(...m):$.duration,$.minDuration,$.maxDuration),maxTemperature:r,suggested:u.length>0||m.length>0,differing:new Set(u).size>1?d:[]}}async openSkip(){let e=this.hass,i=this.refs.deviceId,r={kind:"skip",loading:!0,objects:[],chosen:[]};this.dialog=r;let o;try{o={...r,loading:!1,objects:await Lt(e,i)}}catch(a){let l=await Fe(e,a);o={...r,loading:!1,error:l}}this.dialog===r&&(this.dialog=o)}toggleObject(e){let i=this.dialog;if(i?.kind!=="skip")return;let r=i.chosen.includes(e)?i.chosen.filter(a=>a!==e):[...i.chosen,e],o=i.objects.map(a=>a.id);this.dialog={...i,chosen:r.sort((a,l)=>o.indexOf(a)-o.indexOf(l))}}openFilament(e,i){let r=e.type?e.name:void 0,o=e.color?.toUpperCase();this.dialog={kind:"filament",entityId:e.entityId,title:i,...r?{keep:r,material:re}:{},...o?{current:o,color:o,...Je(o)?{}:{custom:o}}:{}}}editFilament(e){this.dialog={...this.dialog,...e}}pickColor(e){let i=e.toUpperCase();this.editFilament({color:i,...Je(i)?{}:{custom:i}})}endDialog(){this.dialog=void 0,this.dialogFromMenu&&(this.dialogFromMenu=!1,this.focusMenuButton())}async copy(e){try{await navigator.clipboard.writeText(e)}catch{return}this.dialog?.kind==="info"&&(this.dialog={...this.dialog,copied:!0},clearTimeout(this.copiedTimer),this.copiedTimer=setTimeout(()=>{this.dialog?.kind==="info"&&(this.dialog={kind:"info"})},_n))}setDrying(e,i){let r=this.dialog;if(!Number.isFinite(i))return r[e];let o=e==="temperature"?ke(Math.round(i),$.minTemperature,r.maxTemperature):ke(Math.round(i),$.minDuration,$.maxDuration);return this.dialog={...r,[e]:o},o}menuItems(){return[...this.renderRoot.querySelectorAll(".menu [role=menuitem]")]}focusMenuButton(){this.updateComplete.then(()=>this.renderRoot.querySelector(".menu-btn")?.focus())}closeMenu(e){this.menuOpen=!1,e&&this.focusMenuButton()}editDevice(e){history.pushState(null,"",`/config/devices/device/${e}`),window.dispatchEvent(new CustomEvent("location-changed",{detail:{replace:!1}}))}menu(e){let{hass:i,refs:r}=e,o=(l,d,u,m=!1,f=!1)=>c`<button
        role="menuitem"
        tabindex="-1"
        ?disabled=${m}
        @click=${()=>{this.closeMenu(!f),u()}}
      >
        ${h(l)}<span>${s(i,d)}</span>
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
        ${h("dotsVertical")}
      </button>
      ${this.menuOpen?c`<div class="menu" id="bb-menu" role="menu" aria-label=${s(i,"more")} @keydown=${this.menuKeys}>
            ${i.user?.is_admin?o("pencil","menu_device_page",()=>this.editDevice(r.deviceId)):p}
            ${o("infoOutline","menu_info",()=>{this.dialog={kind:"info"},this.dialogFromMenu=!0},!1,!0)}
            ${a?o("refresh","menu_refresh",()=>{this.run("refresh","button","press",{entity_id:a})},b(i,a)?.state==="unavailable"||this.pending.has("refresh")):p}
          </div>`:p}
    </span>`}context(e,i,r){let o=r.online?b(e,r.online)?.state==="on":b(e,r.status)?.state!=="offline",a=b(e,r.status)?.state??"unknown",l=o?a:"offline",d=r.pause!==void 0,u=i.show_controls!==!1;return{hass:e,config:i,refs:r,status:l,online:o,busy:U.has(l),running:Ht.has(l),changing:o&&zt.has(b(e,r.amsStatus)?.state??""),canControl:d&&u,keyLacksControl:u&&!d,...this.canStartLive(o)?{startLive:this.startLive}:{},isPending:m=>this.pending.has(m),run:(m,f,g,v)=>{this.run(m,f,g,v)},confirm:m=>{this.dialog={kind:"confirm",...m}},dry:m=>this.openDrying(m),setFilament:(m,f)=>this.openFilament(m,f),skip:()=>{this.openSkip()},targetOf:m=>this.targetOf(m),stepTarget:(m,f)=>this.stepTarget(m,f),setTargets:m=>this.setTargets(m),switchOn:m=>this.switchOn(m),toggleSwitch:m=>{this.toggleSwitch(m)},optionsOpen:this.optionsOpen,toggleOptions:()=>{this.optionsOpen=!this.optionsOpen},moreInfo:m=>this.moreInfo(m),show:m=>{this.view=m}}}views(e){let i=this.config,r=["status"];return i.show_controls!==!1&&r.push("control"),i.show_ams!==!1&&(e.ams.length||e.externalSpools.length)&&r.push("filament"),r}header(e){let{hass:i,refs:r,status:o}=e,a=r.light?b(i,r.light):void 0,l=a?.state==="on",d=Wt(e),u=Yt(e),m=f=>{this.dialog={kind:f},this.dialogFromMenu=!1};return c`<div class="head">
      <span class="dot ${e.online?"on":""}" role="img" aria-label=${s(i,e.online?"online":"offline")} title=${s(i,e.online?"online":"offline")}></span>
      <div class="names">
        <div class="name" title=${d}>${d}</div>
        ${u?c`<div class="model">${u}</div>`:p}
      </div>
      <span class="chip tone-${me(o)}">${L(i,r.status,o)??o}</span>
      ${r.light&&e.canControl?c`<button
            class="icon-btn light ${l?"on":""}"
            aria-label=${s(i,"light")}
            title=${s(i,"light")}
            aria-pressed=${l?"true":"false"}
            ?disabled=${!e.online||a?.state==="unavailable"||this.pending.has("light")}
            @click=${()=>{this.run("light","light","toggle",{entity_id:r.light})}}
          >
            ${h(l?"lightOn":"lightOff")}
          </button>`:p}
      ${this.menu(e)}
    </div>
    ${tn(e,m)}`}tabs(e){if(e.length<2)return p;let i=this.hass,r=a=>{this.view=a},o=a=>{let l=a.key==="ArrowRight"?1:a.key==="ArrowLeft"?-1:0;if(!l)return;a.preventDefault();let d=(e.indexOf(this.view)+l+e.length)%e.length;r(e[d]),this.updateComplete.then(()=>this.renderRoot.querySelector('.tabs [aria-selected="true"]')?.focus())};return c`<div class="tabs" role="tablist" aria-label=${s(i,"aria_views")} @keydown=${o}>
      ${e.map(a=>c`<button
          role="tab"
          aria-selected=${a===this.view?"true":"false"}
          tabindex=${a===this.view?0:-1}
          @click=${()=>r(a)}
        >
          ${s(i,`tab_${a}`)}
        </button>`)}
    </div>`}picture(e){let{hass:i,refs:r,status:o}=e,a=b(i,r.cover),l=a&&H(i,r.cover)?a.attributes.entity_picture:void 0,u=typeof l=="string"&&l!==this.brokenCover&&ue.has(o)?c`<img
          class="cover"
          src=${l}
          alt=""
          @error=${()=>{this.brokenCover=l}}
        />`:Mt();return e.startLive?c`<button class="picture" aria-label=${s(i,"live")} title=${s(i,"live")} @click=${this.startLive}>
        ${u}<span class="live-hint">${h("video")}</span>
      </button>`:c`<div class="picture ${e.online?"":"offline-pic"}">${u}</div>`}livePanel(){let e=this.hass,r=this.cameraMode==="tap"?c`<button class="icon-btn" aria-label=${s(e,"live_stop")} title=${s(e,"live_stop")} @click=${this.closeLive}>${h("close")}</button>`:p;return this.streamFailed&&(this.liveWanted||this.cameraMode==="always")?c`<div class="live failed" role="status">
        ${h("videoOff")}<span>${s(e,"camera_failed")}</span>
        <button class="btn" @click=${this.retryLive}>${s(e,"retry")}</button>${r}
      </div>`:this.streamSrc?c`<div class="live">
      <img class="stream" src=${this.streamSrc} alt=${s(e,"live")} @error=${this.streamBroke} />
      <span class="live-badge">${s(e,"live_badge")}</span>${r}
    </div>`:p}errorLine(){let e=this.hass;return this.error?c`<div class="toast" role="alert">
      ${h("error")}<span>${this.error}</span>
      <button class="icon-btn" aria-label=${s(e,"dismiss")} title=${s(e,"dismiss")} @click=${this.closeError}>${h("close")}</button>
    </div>`:this.sent?c`<div class="sent-slot"><div class="sent" role="status">${h("check")}<span>${s(e,"sent")}</span></div></div>`:p}render(){let e=this.hass,i=this.config;if(!e||!i)return p;let r=this.refs;if(!r){let u=i.printer?e.devices[i.printer]?"not_a_printer":"not_found":"no_printer";return c`<ha-card><div class="message">${s(e,u)}</div></ha-card>`}let o=this.context(e,i,r),a=this.views(r),l=a.includes(this.view)?this.view:"status",d;return l==="control"?d=Ot(o,this.step,u=>{this.step=u}):l==="filament"?d=un(o):d=vn(o,this.picture(o)),c`<ha-card>
      ${this.header(o)}${this.tabs(a)}${this.livePanel()}
      <div class="body">${d}</div>
      ${this.errorLine()}${this.dialog?pn(o,this.dialog,this.dialogActions):p}
    </ha-card>`}};gn(Qi,tt,{name:()=>s(void 0,"picker_name"),description:()=>s(void 0,"picker_description")});
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
*/
