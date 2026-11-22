import { p as ui, a as fi, r as ci } from "../share.js";
import { Z as $i, b as Ti, c as Pi, e as Ci, f as Ri, g as Fi, d as Ai, h as Si, l as ki, m as Oi, t as ji } from "../share.js";
async function Wr(R = {}) {
  var O, N, _r, c = R, ke = !!globalThis.window, Oe = typeof Bun < "u", Dr = !!globalThis.WorkerGlobalScope;
  !((N = globalThis.process) === null || N === void 0 || (N = N.versions) === null || N === void 0) && N.node && ((_r = globalThis.process) === null || _r === void 0 ? void 0 : _r.type) != "renderer";
  var Mr = "./this.program", je, gr = "";
  function Ee(r) {
    return c.locateFile ? c.locateFile(r, gr) : gr + r;
  }
  var Ur, yr;
  if (ke || Dr || Oe) {
    try {
      gr = new URL(".", je).href;
    } catch {
    }
    Dr && (yr = (r) => {
      var e = new XMLHttpRequest();
      return e.open("GET", r, !1), e.responseType = "arraybuffer", e.send(null), new Uint8Array(e.response);
    }), Ur = async (r) => {
      var e = await fetch(r, {
        credentials: "same-origin"
      });
      if (e.ok)
        return e.arrayBuffer();
      throw new Error(e.status + " : " + e.url);
    };
  }
  var Ir = console.log.bind(console), x = console.error.bind(console), X, Vr = !1, Hr, Br, I, j, tr, G, q, w, Nr, xr, zr = !1;
  function Zr() {
    var r = dr.buffer;
    I = new Int8Array(r), tr = new Int16Array(r), c.HEAPU8 = j = new Uint8Array(r), G = new Uint16Array(r), q = new Int32Array(r), w = new Uint32Array(r), Nr = new Float32Array(r), xr = new Float64Array(r);
  }
  function We() {
    if (c.preRun)
      for (typeof c.preRun == "function" && (c.preRun = [c.preRun]); c.preRun.length; )
        Ze(c.preRun.shift());
    Lr(Gr);
  }
  function De() {
    zr = !0, rr.xa();
  }
  function Me() {
    if (c.postRun)
      for (typeof c.postRun == "function" && (c.postRun = [c.postRun]); c.postRun.length; )
        ze(c.postRun.shift());
    Lr(Xr);
  }
  function mr(r) {
    var e, t;
    (e = c.onAbort) === null || e === void 0 || e.call(c, r), r = "Aborted(" + r + ")", x(r), Vr = !0, r += ". Build with -sASSERTIONS for more info.";
    var n = new WebAssembly.RuntimeError(r);
    throw (t = Br) === null || t === void 0 || t(n), n;
  }
  var z;
  function Ue() {
    return Ee("zxing_reader.wasm");
  }
  function Ie(r) {
    if (r == z && X)
      return new Uint8Array(X);
    if (yr)
      return yr(r);
    throw "both async and sync fetching of the wasm failed";
  }
  async function Ve(r) {
    if (!X)
      try {
        var e = await Ur(r);
        return new Uint8Array(e);
      } catch {
      }
    return Ie(r);
  }
  async function He(r, e) {
    try {
      var t = await Ve(r), n = await WebAssembly.instantiate(t, e);
      return n;
    } catch (i) {
      x(`failed to asynchronously prepare wasm: ${i}`), mr(i);
    }
  }
  async function Be(r, e, t) {
    if (!r && WebAssembly.instantiateStreaming)
      try {
        var n = fetch(e, {
          credentials: "same-origin"
        }), i = await WebAssembly.instantiateStreaming(n, t);
        return i;
      } catch (a) {
        x(`wasm streaming compile failed: ${a}`), x("falling back to ArrayBuffer instantiation");
      }
    return He(e, t);
  }
  function Ne() {
    var r = {
      a: Pn
    };
    return r;
  }
  async function xe() {
    function r(a, s) {
      return rr = a.exports, Tn(rr), Zr(), rr;
    }
    function e(a) {
      return r(a.instance);
    }
    var t = Ne();
    if (c.instantiateWasm)
      return new Promise((a, s) => {
        c.instantiateWasm(t, (o, u) => {
          a(r(o));
        });
      });
    z != null || (z = Ue());
    var n = await Be(X, z, t), i = e(n);
    return i;
  }
  var Lr = (r) => {
    for (; r.length > 0; )
      r.shift()(c);
  }, Xr = [], ze = (r) => Xr.push(r), Gr = [], Ze = (r) => Gr.push(r), h = (r) => _e(r), _ = () => ge(), nr = [], ir = 0, Le = (r) => {
    var e = new br(r);
    return e.get_caught() || (e.set_caught(!0), ir--), e.set_rethrown(!1), nr.push(e), me(r), pe(r);
  }, E = 0, Xe = () => {
    p(0, 0);
    var r = nr.pop();
    ye(r.excPtr), E = 0;
  };
  class br {
    constructor(e) {
      this.excPtr = e, this.ptr = e - 24;
    }
    set_type(e) {
      w[this.ptr + 4 >> 2] = e;
    }
    get_type() {
      return w[this.ptr + 4 >> 2];
    }
    set_destructor(e) {
      w[this.ptr + 8 >> 2] = e;
    }
    get_destructor() {
      return w[this.ptr + 8 >> 2];
    }
    set_caught(e) {
      e = e ? 1 : 0, I[this.ptr + 12] = e;
    }
    get_caught() {
      return I[this.ptr + 12] != 0;
    }
    set_rethrown(e) {
      e = e ? 1 : 0, I[this.ptr + 13] = e;
    }
    get_rethrown() {
      return I[this.ptr + 13] != 0;
    }
    init(e, t) {
      this.set_adjusted_ptr(0), this.set_type(e), this.set_destructor(t);
    }
    set_adjusted_ptr(e) {
      w[this.ptr + 16 >> 2] = e;
    }
    get_adjusted_ptr() {
      return w[this.ptr + 16 >> 2];
    }
  }
  var ar = (r) => he(r), wr = (r) => {
    var e = E;
    if (!e)
      return ar(0), 0;
    var t = new br(e);
    t.set_adjusted_ptr(e);
    var n = t.get_type();
    if (!n)
      return ar(0), e;
    for (var i of r) {
      if (i === 0 || i === n)
        break;
      var a = t.ptr + 16;
      if (be(i, n, a))
        return ar(i), e;
    }
    return ar(n), e;
  }, Ge = () => wr([]), qe = (r) => wr([r]), Ye = (r, e) => wr([r, e]), Ke = () => {
    var r = nr.pop();
    r || mr("no exception to throw");
    var e = r.excPtr;
    throw r.get_rethrown() || (nr.push(r), r.set_rethrown(!0), r.set_caught(!1), ir++), E = e, E;
  }, Je = (r, e, t) => {
    var n = new br(r);
    throw n.init(e, t), E = r, ir++, E;
  }, Qe = () => ir, rt = (r) => {
    throw E || (E = r), E;
  }, et = () => mr(""), sr = {}, $r = (r) => {
    for (; r.length; ) {
      var e = r.pop(), t = r.pop();
      t(e);
    }
  };
  function Y(r) {
    return this.fromWireType(w[r >> 2]);
  }
  var Z = {}, V = {}, or = {}, tt = class extends Error {
    constructor(e) {
      super(e), this.name = "InternalError";
    }
  }, ur = (r) => {
    throw new tt(r);
  }, H = (r, e, t) => {
    r.forEach((o) => or[o] = e);
    function n(o) {
      var u = t(o);
      u.length !== r.length && ur("Mismatched type converter count");
      for (var f = 0; f < r.length; ++f)
        S(r[f], u[f]);
    }
    var i = new Array(e.length), a = [], s = 0;
    for (let [o, u] of e.entries())
      V.hasOwnProperty(u) ? i[o] = V[u] : (a.push(u), Z.hasOwnProperty(u) || (Z[u] = []), Z[u].push(() => {
        i[o] = V[u], ++s, s === a.length && n(i);
      }));
    a.length === 0 && n(i);
  }, nt = (r) => {
    var e = sr[r];
    delete sr[r];
    var t = e.rawConstructor, n = e.rawDestructor, i = e.fields, a = i.map((s) => s.getterReturnType).concat(i.map((s) => s.setterArgumentType));
    H([r], a, (s) => {
      var o = {};
      for (var [u, f] of i.entries()) {
        const l = s[u], v = f.getter, d = f.getterContext, m = s[u + i.length], P = f.setter, T = f.setterContext;
        o[f.fieldName] = {
          read: (b) => l.fromWireType(v(d, b)),
          write: (b, $) => {
            var U = [];
            P(T, b, m.toWireType(U, $)), $r(U);
          },
          optional: l.optional
        };
      }
      return [{
        name: e.name,
        fromWireType: (l) => {
          var v = {};
          for (var d in o)
            v[d] = o[d].read(l);
          return n(l), v;
        },
        toWireType: (l, v) => {
          for (var d in o)
            if (!(d in v) && !o[d].optional)
              throw new TypeError(`Missing field: "${d}"`);
          var m = t();
          for (d in o)
            o[d].write(m, v[d]);
          return l !== null && l.push(n, m), m;
        },
        readValueFromPointer: Y,
        destructorFunction: n
      }];
    });
  }, it = (r, e, t, n, i) => {
  }, C = (r) => {
    for (var e = ""; ; ) {
      var t = j[r++];
      if (!t) return e;
      e += String.fromCharCode(t);
    }
  }, K = class extends Error {
    constructor(e) {
      super(e), this.name = "BindingError";
    }
  }, y = (r) => {
    throw new K(r);
  };
  function at(r, e) {
    let t = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
    var n = e.name;
    if (r || y(`type "${n}" must have a positive integer typeid pointer`), V.hasOwnProperty(r)) {
      if (t.ignoreDuplicateRegistrations)
        return;
      y(`Cannot register type '${n}' twice`);
    }
    if (V[r] = e, delete or[r], Z.hasOwnProperty(r)) {
      var i = Z[r];
      delete Z[r], i.forEach((a) => a());
    }
  }
  function S(r, e) {
    let t = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : {};
    return at(r, e, t);
  }
  var st = (r, e, t, n) => {
    e = C(e), S(r, {
      name: e,
      fromWireType: function(i) {
        return !!i;
      },
      toWireType: function(i, a) {
        return a ? t : n;
      },
      readValueFromPointer: function(i) {
        return this.fromWireType(j[i]);
      },
      destructorFunction: null
    });
  }, ot = (r) => ({
    count: r.count,
    deleteScheduled: r.deleteScheduled,
    preservePointerOnDelete: r.preservePointerOnDelete,
    ptr: r.ptr,
    ptrType: r.ptrType,
    smartPtr: r.smartPtr,
    smartPtrType: r.smartPtrType
  }), Tr = (r) => {
    function e(t) {
      return t.$$.ptrType.registeredClass.name;
    }
    y(e(r) + " instance already deleted");
  }, Pr = !1, qr = (r) => {
  }, ut = (r) => {
    r.smartPtr ? r.smartPtrType.rawDestructor(r.smartPtr) : r.ptrType.registeredClass.rawDestructor(r.ptr);
  }, Yr = (r) => {
    r.count.value -= 1;
    var e = r.count.value === 0;
    e && ut(r);
  }, J = (r) => globalThis.FinalizationRegistry ? (Pr = new FinalizationRegistry((e) => {
    Yr(e.$$);
  }), J = (e) => {
    var t = e.$$, n = !!t.smartPtr;
    if (n) {
      var i = {
        $$: t
      };
      Pr.register(e, i, e);
    }
    return e;
  }, qr = (e) => Pr.unregister(e), J(r)) : (J = (e) => e, r), ft = () => {
    let r = fr.prototype;
    Object.assign(r, {
      isAliasOf(t) {
        if (!(this instanceof fr) || !(t instanceof fr))
          return !1;
        var n = this.$$.ptrType.registeredClass, i = this.$$.ptr;
        t.$$ = t.$$;
        for (var a = t.$$.ptrType.registeredClass, s = t.$$.ptr; n.baseClass; )
          i = n.upcast(i), n = n.baseClass;
        for (; a.baseClass; )
          s = a.upcast(s), a = a.baseClass;
        return n === a && i === s;
      },
      clone() {
        if (this.$$.ptr || Tr(this), this.$$.preservePointerOnDelete)
          return this.$$.count.value += 1, this;
        var t = J(Object.create(Object.getPrototypeOf(this), {
          $$: {
            value: ot(this.$$)
          }
        }));
        return t.$$.count.value += 1, t.$$.deleteScheduled = !1, t;
      },
      delete() {
        this.$$.ptr || Tr(this), this.$$.deleteScheduled && !this.$$.preservePointerOnDelete && y("Object already scheduled for deletion"), qr(this), Yr(this.$$), this.$$.preservePointerOnDelete || (this.$$.smartPtr = void 0, this.$$.ptr = void 0);
      },
      isDeleted() {
        return !this.$$.ptr;
      },
      deleteLater() {
        return this.$$.ptr || Tr(this), this.$$.deleteScheduled && !this.$$.preservePointerOnDelete && y("Object already scheduled for deletion"), this.$$.deleteScheduled = !0, this;
      }
    });
    const e = Symbol.dispose;
    e && (r[e] = r.delete);
  };
  function fr() {
  }
  var Cr = (r, e) => Object.defineProperty(e, "name", {
    value: r
  }), Kr = {}, Jr = (r, e, t) => {
    if (r[e].overloadTable === void 0) {
      var n = r[e];
      r[e] = function() {
        for (var i = arguments.length, a = new Array(i), s = 0; s < i; s++)
          a[s] = arguments[s];
        return r[e].overloadTable.hasOwnProperty(a.length) || y(`Function '${t}' called with an invalid number of arguments (${a.length}) - expects one of (${r[e].overloadTable})!`), r[e].overloadTable[a.length].apply(this, a);
      }, r[e].overloadTable = [], r[e].overloadTable[n.argCount] = n;
    }
  }, Qr = (r, e, t) => {
    c.hasOwnProperty(r) ? ((t === void 0 || c[r].overloadTable !== void 0 && c[r].overloadTable[t] !== void 0) && y(`Cannot register public name '${r}' twice`), Jr(c, r, r), c[r].overloadTable.hasOwnProperty(t) && y(`Cannot register multiple overloads of a function with the same number of arguments (${t})!`), c[r].overloadTable[t] = e) : (c[r] = e, c[r].argCount = t);
  }, ct = 48, lt = 57, vt = (r) => {
    r = r.replace(/[^a-zA-Z0-9_]/g, "$");
    var e = r.charCodeAt(0);
    return e >= ct && e <= lt ? `_${r}` : r;
  };
  function dt(r, e, t, n, i, a, s, o) {
    this.name = r, this.constructor = e, this.instancePrototype = t, this.rawDestructor = n, this.baseClass = i, this.getActualType = a, this.upcast = s, this.downcast = o, this.pureVirtualFunctions = [];
  }
  var Rr = (r, e, t) => {
    for (; e !== t; )
      e.upcast || y(`Expected null or instance of ${t.name}, got an instance of ${e.name}`), r = e.upcast(r), e = e.baseClass;
    return r;
  }, Fr = (r) => {
    if (r === null)
      return "null";
    var e = typeof r;
    return e === "object" || e === "array" || e === "function" ? r.toString() : "" + r;
  };
  function pt(r, e) {
    if (e === null)
      return this.isReference && y(`null is not a valid ${this.name}`), 0;
    e.$$ || y(`Cannot pass "${Fr(e)}" as a ${this.name}`), e.$$.ptr || y(`Cannot pass deleted object as a pointer of type ${this.name}`);
    var t = e.$$.ptrType.registeredClass, n = Rr(e.$$.ptr, t, this.registeredClass);
    return n;
  }
  function ht(r, e) {
    var t;
    if (e === null)
      return this.isReference && y(`null is not a valid ${this.name}`), this.isSmartPointer ? (t = this.rawConstructor(), r !== null && r.push(this.rawDestructor, t), t) : 0;
    (!e || !e.$$) && y(`Cannot pass "${Fr(e)}" as a ${this.name}`), e.$$.ptr || y(`Cannot pass deleted object as a pointer of type ${this.name}`), !this.isConst && e.$$.ptrType.isConst && y(`Cannot convert argument of type ${e.$$.smartPtrType ? e.$$.smartPtrType.name : e.$$.ptrType.name} to parameter type ${this.name}`);
    var n = e.$$.ptrType.registeredClass;
    if (t = Rr(e.$$.ptr, n, this.registeredClass), this.isSmartPointer)
      switch (e.$$.smartPtr === void 0 && y("Passing raw pointer to smart pointer is illegal"), this.sharingPolicy) {
        case 0:
          e.$$.smartPtrType === this ? t = e.$$.smartPtr : y(`Cannot convert argument of type ${e.$$.smartPtrType ? e.$$.smartPtrType.name : e.$$.ptrType.name} to parameter type ${this.name}`);
          break;
        case 1:
          t = e.$$.smartPtr;
          break;
        case 2:
          if (e.$$.smartPtrType === this)
            t = e.$$.smartPtr;
          else {
            var i = e.clone();
            t = this.rawShare(t, k.toHandle(() => i.delete())), r !== null && r.push(this.rawDestructor, t);
          }
          break;
        default:
          y("Unsupporting sharing policy");
      }
    return t;
  }
  function _t(r, e) {
    if (e === null)
      return this.isReference && y(`null is not a valid ${this.name}`), 0;
    e.$$ || y(`Cannot pass "${Fr(e)}" as a ${this.name}`), e.$$.ptr || y(`Cannot pass deleted object as a pointer of type ${this.name}`), e.$$.ptrType.isConst && y(`Cannot convert argument of type ${e.$$.ptrType.name} to parameter type ${this.name}`);
    var t = e.$$.ptrType.registeredClass, n = Rr(e.$$.ptr, t, this.registeredClass);
    return n;
  }
  var re = (r, e, t) => {
    if (e === t)
      return r;
    if (t.baseClass === void 0)
      return null;
    var n = re(r, e, t.baseClass);
    return n === null ? null : t.downcast(n);
  }, gt = {}, yt = (r, e) => {
    for (e === void 0 && y("ptr should not be undefined"); r.baseClass; )
      e = r.upcast(e), r = r.baseClass;
    return e;
  }, mt = (r, e) => (e = yt(r, e), gt[e]), cr = (r, e) => {
    (!e.ptrType || !e.ptr) && ur("makeClassHandle requires ptr and ptrType");
    var t = !!e.smartPtrType, n = !!e.smartPtr;
    return t !== n && ur("Both smartPtrType and smartPtr must be specified"), e.count = {
      value: 1
    }, J(Object.create(r, {
      $$: {
        value: e,
        writable: !0
      }
    }));
  };
  function bt(r) {
    var e = this.getPointee(r);
    if (!e)
      return this.destructor(r), null;
    var t = mt(this.registeredClass, e);
    if (t !== void 0) {
      if (t.$$.count.value === 0)
        return t.$$.ptr = e, t.$$.smartPtr = r, t.clone();
      var n = t.clone();
      return this.destructor(r), n;
    }
    function i() {
      return this.isSmartPointer ? cr(this.registeredClass.instancePrototype, {
        ptrType: this.pointeeType,
        ptr: e,
        smartPtrType: this,
        smartPtr: r
      }) : cr(this.registeredClass.instancePrototype, {
        ptrType: this,
        ptr: r
      });
    }
    var a = this.registeredClass.getActualType(e), s = Kr[a];
    if (!s)
      return i.call(this);
    var o;
    this.isConst ? o = s.constPointerType : o = s.pointerType;
    var u = re(e, this.registeredClass, o.registeredClass);
    return u === null ? i.call(this) : this.isSmartPointer ? cr(o.registeredClass.instancePrototype, {
      ptrType: o,
      ptr: u,
      smartPtrType: this,
      smartPtr: r
    }) : cr(o.registeredClass.instancePrototype, {
      ptrType: o,
      ptr: u
    });
  }
  var wt = () => {
    Object.assign(lr.prototype, {
      getPointee(r) {
        return this.rawGetPointee && (r = this.rawGetPointee(r)), r;
      },
      destructor(r) {
        var e;
        (e = this.rawDestructor) === null || e === void 0 || e.call(this, r);
      },
      readValueFromPointer: Y,
      fromWireType: bt
    });
  };
  function lr(r, e, t, n, i, a, s, o, u, f, l) {
    this.name = r, this.registeredClass = e, this.isReference = t, this.isConst = n, this.isSmartPointer = i, this.pointeeType = a, this.sharingPolicy = s, this.rawGetPointee = o, this.rawConstructor = u, this.rawShare = f, this.rawDestructor = l, !i && e.baseClass === void 0 ? n ? (this.toWireType = pt, this.destructorFunction = null) : (this.toWireType = _t, this.destructorFunction = null) : this.toWireType = ht;
  }
  var ee = (r, e, t) => {
    c.hasOwnProperty(r) || ur("Replacing nonexistent public symbol"), c[r].overloadTable !== void 0 && t !== void 0 ? c[r].overloadTable[t] = e : (c[r] = e, c[r].argCount = t);
  }, D = {}, $t = (r, e, t) => {
    r = r.replace(/p/g, "i");
    var n = D[r];
    return n(e, ...t);
  }, te = [], g = (r) => {
    var e = te[r];
    return e || (te[r] = e = Te.get(r)), e;
  }, Tt = function(r, e) {
    let t = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : [];
    if (r.includes("j"))
      return $t(r, e, t);
    var n = g(e), i = n(...t);
    function a(s) {
      return s;
    }
    return i;
  }, Pt = function(r, e) {
    let t = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : !1;
    return function() {
      for (var n = arguments.length, i = new Array(n), a = 0; a < n; a++)
        i[a] = arguments[a];
      return Tt(r, e, i, t);
    };
  }, A = function(r, e) {
    r = C(r);
    function t() {
      if (r.includes("j"))
        return Pt(r, e);
      var i = g(e);
      return i;
    }
    var n = t();
    return typeof n != "function" && y(`unknown function pointer with signature ${r}: ${e}`), n;
  };
  class Ct extends Error {
  }
  var ne = (r) => {
    var e = de(r), t = C(e);
    return M(e), t;
  }, vr = (r, e) => {
    var t = [], n = {};
    function i(a) {
      if (!n[a] && !V[a]) {
        if (or[a]) {
          or[a].forEach(i);
          return;
        }
        t.push(a), n[a] = !0;
      }
    }
    throw e.forEach(i), new Ct(`${r}: ` + t.map(ne).join([", "]));
  }, Rt = (r, e, t, n, i, a, s, o, u, f, l, v, d) => {
    l = C(l), a = A(i, a), o && (o = A(s, o)), f && (f = A(u, f)), d = A(v, d);
    var m = vt(l);
    Qr(m, function() {
      vr(`Cannot construct ${l} due to unbound types`, [n]);
    }), H([r, e, t], n ? [n] : [], (P) => {
      P = P[0];
      var T, b;
      n ? (T = P.registeredClass, b = T.instancePrototype) : b = fr.prototype;
      var $ = Cr(l, function() {
        if (Object.getPrototypeOf(this) !== U)
          throw new K(`Use 'new' to construct ${l}`);
        if (F.constructor_body === void 0)
          throw new K(`${l} has no accessible constructor`);
        for (var Re = arguments.length, pr = new Array(Re), hr = 0; hr < Re; hr++)
          pr[hr] = arguments[hr];
        var Fe = F.constructor_body[pr.length];
        if (Fe === void 0)
          throw new K(`Tried to invoke ctor of ${l} with invalid number of parameters (${pr.length}) - expected (${Object.keys(F.constructor_body).toString()}) parameters instead!`);
        return Fe.apply(this, pr);
      }), U = Object.create(b, {
        constructor: {
          value: $
        }
      });
      $.prototype = U;
      var F = new dt(l, $, U, d, T, a, o, f);
      if (F.baseClass) {
        var W, er;
        (er = (W = F.baseClass).__derivedClasses) !== null && er !== void 0 || (W.__derivedClasses = []), F.baseClass.__derivedClasses.push(F);
      }
      var oi = new lr(l, F, !0, !1, !1), Pe = new lr(l + "*", F, !1, !1, !1), Ce = new lr(l + " const*", F, !1, !0, !1);
      return Kr[r] = {
        pointerType: Pe,
        constPointerType: Ce
      }, ee(m, $), [oi, Pe, Ce];
    });
  }, Ar = (r, e) => {
    for (var t = [], n = 0; n < r; n++)
      t.push(w[e + n * 4 >> 2]);
    return t;
  };
  function Ft(r) {
    for (var e = 1; e < r.length; ++e)
      if (r[e] !== null && r[e].destructorFunction === void 0)
        return !0;
    return !1;
  }
  function Sr(r, e, t, n, i, a) {
    var s = e.length;
    s < 2 && y("argTypes array size mismatch! Must at least get return value and 'this' types!");
    var o = e[1] !== null && t !== null, u = Ft(e), f = !e[0].isVoid, l = s - 2, v = new Array(l), d = [], m = [], P = function() {
      m.length = 0;
      var T;
      d.length = o ? 2 : 1, d[0] = i, o && (T = e[1].toWireType(m, this), d[1] = T);
      for (var b = 0; b < l; ++b)
        v[b] = e[b + 2].toWireType(m, b < 0 || arguments.length <= b ? void 0 : arguments[b]), d.push(v[b]);
      var $ = n(...d);
      function U(F) {
        if (u)
          $r(m);
        else
          for (var W = o ? 1 : 2; W < e.length; W++) {
            var er = W === 1 ? T : v[W - 2];
            e[W].destructorFunction !== null && e[W].destructorFunction(er);
          }
        if (f)
          return e[0].fromWireType(F);
      }
      return U($);
    };
    return Cr(r, P);
  }
  var At = (r, e, t, n, i, a) => {
    var s = Ar(e, t);
    i = A(n, i), H([], [r], (o) => {
      o = o[0];
      var u = `constructor ${o.name}`;
      if (o.registeredClass.constructor_body === void 0 && (o.registeredClass.constructor_body = []), o.registeredClass.constructor_body[e - 1] !== void 0)
        throw new K(`Cannot register multiple constructors with identical number of parameters (${e - 1}) for class '${o.name}'! Overload resolution is currently only performed using the parameter count, not actual type info!`);
      return o.registeredClass.constructor_body[e - 1] = () => {
        vr(`Cannot construct ${o.name} due to unbound types`, s);
      }, H([], s, (f) => (f.splice(1, 0, null), o.registeredClass.constructor_body[e - 1] = Sr(u, f, null, i, a), [])), [];
    });
  }, ie = (r) => {
    r = r.trim();
    const e = r.indexOf("(");
    return e === -1 ? r : r.slice(0, e);
  }, St = (r, e, t, n, i, a, s, o, u, f) => {
    var l = Ar(t, n);
    e = C(e), e = ie(e), a = A(i, a), H([], [r], (v) => {
      v = v[0];
      var d = `${v.name}.${e}`;
      e.startsWith("@@") && (e = Symbol[e.substring(2)]), o && v.registeredClass.pureVirtualFunctions.push(e);
      function m() {
        vr(`Cannot call ${d} due to unbound types`, l);
      }
      var P = v.registeredClass.instancePrototype, T = P[e];
      return T === void 0 || T.overloadTable === void 0 && T.className !== v.name && T.argCount === t - 2 ? (m.argCount = t - 2, m.className = v.name, P[e] = m) : (Jr(P, e, d), P[e].overloadTable[t - 2] = m), H([], l, (b) => {
        var $ = Sr(d, b, v, a, s);
        return P[e].overloadTable === void 0 ? ($.argCount = t - 2, P[e] = $) : P[e].overloadTable[t - 2] = $, [];
      }), [];
    });
  }, ae = [], B = [0, 1, , 1, null, 1, !0, 1, !1, 1], kr = (r) => {
    r > 9 && --B[r + 1] === 0 && (B[r] = void 0, ae.push(r));
  }, k = {
    toValue: (r) => (r || y(`Cannot use deleted val. handle = ${r}`), B[r]),
    toHandle: (r) => {
      switch (r) {
        case void 0:
          return 2;
        case null:
          return 4;
        case !0:
          return 6;
        case !1:
          return 8;
        default: {
          const e = ae.pop() || B.length;
          return B[e] = r, B[e + 1] = 1, e;
        }
      }
    }
  }, se = {
    name: "emscripten::val",
    fromWireType: (r) => {
      var e = k.toValue(r);
      return kr(r), e;
    },
    toWireType: (r, e) => k.toHandle(e),
    readValueFromPointer: Y,
    destructorFunction: null
  }, kt = (r) => S(r, se), Ot = (r, e) => {
    switch (e) {
      case 4:
        return function(t) {
          return this.fromWireType(Nr[t >> 2]);
        };
      case 8:
        return function(t) {
          return this.fromWireType(xr[t >> 3]);
        };
      default:
        throw new TypeError(`invalid float width (${e}): ${r}`);
    }
  }, jt = (r, e, t) => {
    e = C(e), S(r, {
      name: e,
      fromWireType: (n) => n,
      toWireType: (n, i) => i,
      readValueFromPointer: Ot(e, t),
      destructorFunction: null
    });
  }, Et = (r, e, t, n, i, a, s, o) => {
    var u = Ar(e, t);
    r = C(r), r = ie(r), i = A(n, i), Qr(r, function() {
      vr(`Cannot call ${r} due to unbound types`, u);
    }, e - 1), H([], u, (f) => {
      var l = [f[0], null].concat(f.slice(1));
      return ee(r, Sr(r, l, null, i, a), e - 1), [];
    });
  }, Wt = (r, e, t) => {
    switch (e) {
      case 1:
        return t ? (n) => I[n] : (n) => j[n];
      case 2:
        return t ? (n) => tr[n >> 1] : (n) => G[n >> 1];
      case 4:
        return t ? (n) => q[n >> 2] : (n) => w[n >> 2];
      default:
        throw new TypeError(`invalid integer width (${e}): ${r}`);
    }
  }, Dt = (r, e, t, n, i) => {
    e = C(e);
    const a = n === 0;
    let s = (u) => u;
    if (a) {
      var o = 32 - 8 * t;
      s = (u) => u << o >>> o, i = s(i);
    }
    S(r, {
      name: e,
      fromWireType: s,
      toWireType: (u, f) => f,
      readValueFromPointer: Wt(e, t, n !== 0),
      destructorFunction: null
    });
  }, Mt = (r, e, t) => {
    var n = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array], i = n[e];
    function a(s) {
      var o = w[s >> 2], u = w[s + 4 >> 2];
      return new i(I.buffer, u, o);
    }
    t = C(t), S(r, {
      name: t,
      fromWireType: a,
      readValueFromPointer: a
    }, {
      ignoreDuplicateRegistrations: !0
    });
  }, Ut = Object.assign({
    optional: !0
  }, se), It = (r, e) => {
    S(r, Ut);
  }, Vt = (r, e, t, n) => {
    if (!(n > 0)) return 0;
    for (var i = t, a = t + n - 1, s = 0; s < r.length; ++s) {
      var o = r.codePointAt(s);
      if (o <= 127) {
        if (t >= a) break;
        e[t++] = o;
      } else if (o <= 2047) {
        if (t + 1 >= a) break;
        e[t++] = 192 | o >> 6, e[t++] = 128 | o & 63;
      } else if (o <= 65535) {
        if (t + 2 >= a) break;
        e[t++] = 224 | o >> 12, e[t++] = 128 | o >> 6 & 63, e[t++] = 128 | o & 63;
      } else {
        if (t + 3 >= a) break;
        e[t++] = 240 | o >> 18, e[t++] = 128 | o >> 12 & 63, e[t++] = 128 | o >> 6 & 63, e[t++] = 128 | o & 63, s++;
      }
    }
    return e[t] = 0, t - i;
  }, L = (r, e, t) => Vt(r, j, e, t), oe = (r) => {
    for (var e = 0, t = 0; t < r.length; ++t) {
      var n = r.charCodeAt(t);
      n <= 127 ? e++ : n <= 2047 ? e += 2 : n >= 55296 && n <= 57343 ? (e += 4, ++t) : e += 3;
    }
    return e;
  }, ue = globalThis.TextDecoder && new TextDecoder(), fe = (r, e, t, n) => {
    var i = e + t;
    if (n) return i;
    for (; r[e] && !(e >= i); ) ++e;
    return e;
  }, ce = function(r) {
    let e = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 0, t = arguments.length > 2 ? arguments[2] : void 0, n = arguments.length > 3 ? arguments[3] : void 0;
    var i = fe(r, e, t, n);
    if (i - e > 16 && r.buffer && ue)
      return ue.decode(r.subarray(e, i));
    for (var a = ""; e < i; ) {
      var s = r[e++];
      if (!(s & 128)) {
        a += String.fromCharCode(s);
        continue;
      }
      var o = r[e++] & 63;
      if ((s & 224) == 192) {
        a += String.fromCharCode((s & 31) << 6 | o);
        continue;
      }
      var u = r[e++] & 63;
      if ((s & 240) == 224 ? s = (s & 15) << 12 | o << 6 | u : s = (s & 7) << 18 | o << 12 | u << 6 | r[e++] & 63, s < 65536)
        a += String.fromCharCode(s);
      else {
        var f = s - 65536;
        a += String.fromCharCode(55296 | f >> 10, 56320 | f & 1023);
      }
    }
    return a;
  }, Ht = (r, e, t) => r ? ce(j, r, e, t) : "", Bt = (r, e) => {
    e = C(e), S(r, {
      name: e,
      fromWireType(t) {
        var n = w[t >> 2], i = t + 4, a;
        return a = Ht(i, n, !0), M(t), a;
      },
      toWireType(t, n) {
        n instanceof ArrayBuffer && (n = new Uint8Array(n));
        var i, a = typeof n == "string";
        a || ArrayBuffer.isView(n) && n.BYTES_PER_ELEMENT == 1 || y("Cannot pass non-string to std::string"), a ? i = oe(n) : i = n.length;
        var s = Er(4 + i + 1), o = s + 4;
        return w[s >> 2] = i, a ? L(n, o, i + 1) : j.set(n, o), t !== null && t.push(M, s), s;
      },
      readValueFromPointer: Y,
      destructorFunction(t) {
        M(t);
      }
    });
  }, le = globalThis.TextDecoder ? new TextDecoder("utf-16le") : void 0, Nt = (r, e, t) => {
    var n = r >> 1, i = fe(G, n, e / 2, t);
    if (i - n > 16 && le) return le.decode(G.subarray(n, i));
    for (var a = "", s = n; s < i; ++s) {
      var o = G[s];
      a += String.fromCharCode(o);
    }
    return a;
  }, xt = (r, e, t) => {
    if (t != null || (t = 2147483647), t < 2) return 0;
    t -= 2;
    for (var n = e, i = t < r.length * 2 ? t / 2 : r.length, a = 0; a < i; ++a) {
      var s = r.charCodeAt(a);
      tr[e >> 1] = s, e += 2;
    }
    return tr[e >> 1] = 0, e - n;
  }, zt = (r) => r.length * 2, Zt = (r, e, t) => {
    for (var n = "", i = r >> 2, a = 0; !(a >= e / 4); a++) {
      var s = w[i + a];
      if (!s && !t) break;
      n += String.fromCodePoint(s);
    }
    return n;
  }, Lt = (r, e, t) => {
    if (t != null || (t = 2147483647), t < 4) return 0;
    for (var n = e, i = n + t - 4, a = 0; a < r.length; ++a) {
      var s = r.codePointAt(a);
      if (s > 65535 && a++, q[e >> 2] = s, e += 4, e + 4 > i) break;
    }
    return q[e >> 2] = 0, e - n;
  }, Xt = (r) => {
    for (var e = 0, t = 0; t < r.length; ++t) {
      var n = r.codePointAt(t);
      n > 65535 && t++, e += 4;
    }
    return e;
  }, Gt = (r, e, t) => {
    t = C(t);
    var n, i, a;
    e === 2 ? (n = Nt, i = xt, a = zt) : (n = Zt, i = Lt, a = Xt), S(r, {
      name: t,
      fromWireType: (s) => {
        var o = w[s >> 2], u = n(s + 4, o * e, !0);
        return M(s), u;
      },
      toWireType: (s, o) => {
        typeof o != "string" && y(`Cannot pass non-string to C++ string type ${t}`);
        var u = a(o), f = Er(4 + u + e);
        return w[f >> 2] = u / e, i(o, f + 4, u + e), s !== null && s.push(M, f), f;
      },
      readValueFromPointer: Y,
      destructorFunction(s) {
        M(s);
      }
    });
  }, qt = (r, e, t, n, i, a) => {
    sr[r] = {
      name: C(e),
      rawConstructor: A(t, n),
      rawDestructor: A(i, a),
      fields: []
    };
  }, Yt = (r, e, t, n, i, a, s, o, u, f) => {
    sr[r].fields.push({
      fieldName: C(e),
      getterReturnType: t,
      getter: A(n, i),
      getterContext: a,
      setterArgumentType: s,
      setter: A(o, u),
      setterContext: f
    });
  }, Kt = (r, e) => {
    e = C(e), S(r, {
      isVoid: !0,
      name: e,
      fromWireType: () => {
      },
      toWireType: (t, n) => {
      }
    });
  }, Or = [], Jt = (r) => {
    var e = Or.length;
    return Or.push(r), e;
  }, Qt = (r, e) => {
    var t = V[r];
    return t === void 0 && y(`${e} has unknown type ${ne(r)}`), t;
  }, rn = (r, e) => {
    for (var t = new Array(r), n = 0; n < r; ++n)
      t[n] = Qt(w[e + n * 4 >> 2], `parameter ${n}`);
    return t;
  }, en = (r, e, t) => {
    var n = [], i = r(n, t);
    return n.length && (w[e >> 2] = k.toHandle(n)), i;
  }, tn = {}, ve = (r) => {
    var e = tn[r];
    return e === void 0 ? C(r) : e;
  }, nn = (r, e, t) => {
    var n = 8, [i, ...a] = rn(r, e), s = i.toWireType.bind(i), o = a.map((v) => v.readValueFromPointer.bind(v));
    r--;
    var u = new Array(r), f = (v, d, m, P) => {
      for (var T = 0, b = 0; b < r; ++b)
        u[b] = o[b](P + T), T += n;
      var $;
      switch (t) {
        case 0:
          $ = k.toValue(v).apply(null, u);
          break;
        case 2:
          $ = Reflect.construct(k.toValue(v), u);
          break;
        case 3:
          $ = u[0];
          break;
        case 1:
          $ = k.toValue(v)[ve(d)](...u);
          break;
      }
      return en(s, m, $);
    }, l = `methodCaller<(${a.map((v) => v.name)}) => ${i.name}>`;
    return Jt(Cr(l, f));
  }, an = (r) => r ? (r = ve(r), k.toHandle(globalThis[r])) : k.toHandle(globalThis), sn = (r) => {
    r > 9 && (B[r + 1] += 1);
  }, on = (r, e, t, n, i) => Or[r](e, t, n, i), un = (r) => {
    var e = k.toValue(r);
    $r(e), kr(r);
  }, fn = (r, e, t, n) => {
    var i = (/* @__PURE__ */ new Date()).getFullYear(), a = new Date(i, 0, 1), s = new Date(i, 6, 1), o = a.getTimezoneOffset(), u = s.getTimezoneOffset(), f = Math.max(o, u);
    w[r >> 2] = f * 60, q[e >> 2] = +(o != u);
    var l = (m) => {
      var P = m >= 0 ? "-" : "+", T = Math.abs(m), b = String(Math.floor(T / 60)).padStart(2, "0"), $ = String(T % 60).padStart(2, "0");
      return `UTC${P}${b}${$}`;
    }, v = l(o), d = l(u);
    u < o ? (L(v, t, 17), L(d, n, 17)) : (L(v, n, 17), L(d, t, 17));
  }, cn = () => 2147483648, ln = (r, e) => Math.ceil(r / e) * e, vn = (r) => {
    var e = dr.buffer.byteLength, t = (r - e + 65535) / 65536 | 0;
    try {
      return dr.grow(t), Zr(), 1;
    } catch {
    }
  }, dn = (r) => {
    var e = j.length;
    r >>>= 0;
    var t = cn();
    if (r > t)
      return !1;
    for (var n = 1; n <= 4; n *= 2) {
      var i = e * (1 + 0.2 / n);
      i = Math.min(i, r + 100663296);
      var a = Math.min(t, ln(Math.max(r, i), 65536)), s = vn(a);
      if (s)
        return !0;
    }
    return !1;
  }, jr = {}, pn = () => Mr || "./this.program", Q = () => {
    if (!Q.strings) {
      var r = (typeof navigator == "object" && navigator.language || "C").replace("-", "_") + ".UTF-8", e = {
        USER: "web_user",
        LOGNAME: "web_user",
        PATH: "/",
        PWD: "/",
        HOME: "/home/web_user",
        LANG: r,
        _: pn()
      };
      for (var t in jr)
        jr[t] === void 0 ? delete e[t] : e[t] = jr[t];
      var n = [];
      for (var t in e)
        n.push(`${t}=${e[t]}`);
      Q.strings = n;
    }
    return Q.strings;
  }, hn = (r, e) => {
    var t = 0, n = 0;
    for (var i of Q()) {
      var a = e + t;
      w[r + n >> 2] = a, t += L(i, a, 1 / 0) + 1, n += 4;
    }
    return 0;
  }, _n = (r, e) => {
    var t = Q();
    w[r >> 2] = t.length;
    var n = 0;
    for (var i of t)
      n += oe(i) + 1;
    return w[e >> 2] = n, 0;
  }, gn = (r) => 52;
  function yn(r, e, t, n, i) {
    return 70;
  }
  var mn = [null, [], []], bn = (r, e) => {
    var t = mn[r];
    e === 0 || e === 10 ? ((r === 1 ? Ir : x)(ce(t)), t.length = 0) : t.push(e);
  }, wn = (r, e, t, n) => {
    for (var i = 0, a = 0; a < t; a++) {
      var s = w[e >> 2], o = w[e + 4 >> 2];
      e += 8;
      for (var u = 0; u < o; u++)
        bn(r, j[s + u]);
      i += o;
    }
    return w[n >> 2] = i, 0;
  }, $n = (r) => r;
  if (ft(), wt(), c.noExitRuntime && c.noExitRuntime, c.print && (Ir = c.print), c.printErr && (x = c.printErr), c.wasmBinary && (X = c.wasmBinary), c.arguments && c.arguments, c.thisProgram && (Mr = c.thisProgram), c.preInit)
    for (typeof c.preInit == "function" && (c.preInit = [c.preInit]); c.preInit.length > 0; )
      c.preInit.shift()();
  var de, M, Er, pe, p, he, _e, ge, ye, me, be, we, $e, dr, Te;
  function Tn(r) {
    de = r.ya, M = c._free = r.za, Er = c._malloc = r.Ba, pe = r.Ca, p = r.Da, he = r.Ea, _e = r.Fa, ge = r.Ga, ye = r.Ha, me = r.Ia, be = r.Ja, D.viijii = r.Ka, we = D.iiijj = r.La, D.jiji = r.Ma, $e = D.jiiii = r.Na, D.iiiiij = r.Oa, D.iiiiijj = r.Pa, D.iiiiiijj = r.Qa, dr = r.wa, Te = r.Aa;
  }
  var Pn = {
    s: Le,
    w: Xe,
    a: Ge,
    j: qe,
    m: Ye,
    Q: Ke,
    p: Je,
    U: Qe,
    d: rt,
    ca: et,
    ta: nt,
    ba: it,
    oa: st,
    ra: Rt,
    qa: At,
    H: St,
    ma: kt,
    X: jt,
    Y: Et,
    x: Dt,
    t: Mt,
    sa: It,
    na: Bt,
    R: Gt,
    I: qt,
    ua: Yt,
    pa: Kt,
    N: nn,
    va: kr,
    D: an,
    S: sn,
    M: on,
    ia: un,
    da: fn,
    ga: dn,
    ea: hn,
    fa: _n,
    ha: gn,
    $: yn,
    V: wn,
    K: Xn,
    C: Yn,
    Z: On,
    T: ti,
    r: xn,
    b: Sn,
    E: Ln,
    ka: Jn,
    c: jn,
    ja: Qn,
    h: kn,
    i: Dn,
    q: Vn,
    P: Zn,
    v: Bn,
    F: Nn,
    L: zn,
    z: Kn,
    J: ni,
    aa: ii,
    _: ai,
    f: En,
    l: Cn,
    e: An,
    g: Fn,
    O: ei,
    k: Rn,
    la: Gn,
    o: Hn,
    B: Mn,
    u: qn,
    W: In,
    A: ri,
    n: Wn,
    G: Un,
    y: $n
  };
  function Cn(r, e) {
    var t = _();
    try {
      g(r)(e);
    } catch (n) {
      if (h(t), n !== n + 0) throw n;
      p(1, 0);
    }
  }
  function Rn(r, e, t, n, i) {
    var a = _();
    try {
      g(r)(e, t, n, i);
    } catch (s) {
      if (h(a), s !== s + 0) throw s;
      p(1, 0);
    }
  }
  function Fn(r, e, t, n) {
    var i = _();
    try {
      g(r)(e, t, n);
    } catch (a) {
      if (h(i), a !== a + 0) throw a;
      p(1, 0);
    }
  }
  function An(r, e, t) {
    var n = _();
    try {
      g(r)(e, t);
    } catch (i) {
      if (h(n), i !== i + 0) throw i;
      p(1, 0);
    }
  }
  function Sn(r, e) {
    var t = _();
    try {
      return g(r)(e);
    } catch (n) {
      if (h(t), n !== n + 0) throw n;
      p(1, 0);
    }
  }
  function kn(r, e, t, n) {
    var i = _();
    try {
      return g(r)(e, t, n);
    } catch (a) {
      if (h(i), a !== a + 0) throw a;
      p(1, 0);
    }
  }
  function On(r, e, t, n, i, a) {
    var s = _();
    try {
      return g(r)(e, t, n, i, a);
    } catch (o) {
      if (h(s), o !== o + 0) throw o;
      p(1, 0);
    }
  }
  function jn(r, e, t) {
    var n = _();
    try {
      return g(r)(e, t);
    } catch (i) {
      if (h(n), i !== i + 0) throw i;
      p(1, 0);
    }
  }
  function En(r) {
    var e = _();
    try {
      g(r)();
    } catch (t) {
      if (h(e), t !== t + 0) throw t;
      p(1, 0);
    }
  }
  function Wn(r, e, t, n, i, a, s, o, u, f, l) {
    var v = _();
    try {
      g(r)(e, t, n, i, a, s, o, u, f, l);
    } catch (d) {
      if (h(v), d !== d + 0) throw d;
      p(1, 0);
    }
  }
  function Dn(r, e, t, n, i) {
    var a = _();
    try {
      return g(r)(e, t, n, i);
    } catch (s) {
      if (h(a), s !== s + 0) throw s;
      p(1, 0);
    }
  }
  function Mn(r, e, t, n, i, a, s) {
    var o = _();
    try {
      g(r)(e, t, n, i, a, s);
    } catch (u) {
      if (h(o), u !== u + 0) throw u;
      p(1, 0);
    }
  }
  function Un(r, e, t, n, i, a, s, o, u, f, l, v, d, m, P, T) {
    var b = _();
    try {
      g(r)(e, t, n, i, a, s, o, u, f, l, v, d, m, P, T);
    } catch ($) {
      if (h(b), $ !== $ + 0) throw $;
      p(1, 0);
    }
  }
  function In(r, e, t, n, i, a, s, o, u) {
    var f = _();
    try {
      g(r)(e, t, n, i, a, s, o, u);
    } catch (l) {
      if (h(f), l !== l + 0) throw l;
      p(1, 0);
    }
  }
  function Vn(r, e, t, n, i, a) {
    var s = _();
    try {
      return g(r)(e, t, n, i, a);
    } catch (o) {
      if (h(s), o !== o + 0) throw o;
      p(1, 0);
    }
  }
  function Hn(r, e, t, n, i, a) {
    var s = _();
    try {
      g(r)(e, t, n, i, a);
    } catch (o) {
      if (h(s), o !== o + 0) throw o;
      p(1, 0);
    }
  }
  function Bn(r, e, t, n, i, a, s) {
    var o = _();
    try {
      return g(r)(e, t, n, i, a, s);
    } catch (u) {
      if (h(o), u !== u + 0) throw u;
      p(1, 0);
    }
  }
  function Nn(r, e, t, n, i, a, s, o) {
    var u = _();
    try {
      return g(r)(e, t, n, i, a, s, o);
    } catch (f) {
      if (h(u), f !== f + 0) throw f;
      p(1, 0);
    }
  }
  function xn(r) {
    var e = _();
    try {
      return g(r)();
    } catch (t) {
      if (h(e), t !== t + 0) throw t;
      p(1, 0);
    }
  }
  function zn(r, e, t, n, i, a, s, o, u) {
    var f = _();
    try {
      return g(r)(e, t, n, i, a, s, o, u);
    } catch (l) {
      if (h(f), l !== l + 0) throw l;
      p(1, 0);
    }
  }
  function Zn(r, e, t, n, i, a, s) {
    var o = _();
    try {
      return g(r)(e, t, n, i, a, s);
    } catch (u) {
      if (h(o), u !== u + 0) throw u;
      p(1, 0);
    }
  }
  function Ln(r, e, t, n) {
    var i = _();
    try {
      return g(r)(e, t, n);
    } catch (a) {
      if (h(i), a !== a + 0) throw a;
      p(1, 0);
    }
  }
  function Xn(r, e, t, n) {
    var i = _();
    try {
      return g(r)(e, t, n);
    } catch (a) {
      if (h(i), a !== a + 0) throw a;
      p(1, 0);
    }
  }
  function Gn(r, e, t, n, i, a, s, o) {
    var u = _();
    try {
      g(r)(e, t, n, i, a, s, o);
    } catch (f) {
      if (h(u), f !== f + 0) throw f;
      p(1, 0);
    }
  }
  function qn(r, e, t, n, i, a, s, o) {
    var u = _();
    try {
      g(r)(e, t, n, i, a, s, o);
    } catch (f) {
      if (h(u), f !== f + 0) throw f;
      p(1, 0);
    }
  }
  function Yn(r, e, t, n, i, a) {
    var s = _();
    try {
      return g(r)(e, t, n, i, a);
    } catch (o) {
      if (h(s), o !== o + 0) throw o;
      p(1, 0);
    }
  }
  function Kn(r, e, t, n, i, a, s, o, u, f) {
    var l = _();
    try {
      return g(r)(e, t, n, i, a, s, o, u, f);
    } catch (v) {
      if (h(l), v !== v + 0) throw v;
      p(1, 0);
    }
  }
  function Jn(r, e, t) {
    var n = _();
    try {
      return g(r)(e, t);
    } catch (i) {
      if (h(n), i !== i + 0) throw i;
      p(1, 0);
    }
  }
  function Qn(r, e, t, n, i) {
    var a = _();
    try {
      return g(r)(e, t, n, i);
    } catch (s) {
      if (h(a), s !== s + 0) throw s;
      p(1, 0);
    }
  }
  function ri(r, e, t, n, i, a, s, o, u, f) {
    var l = _();
    try {
      g(r)(e, t, n, i, a, s, o, u, f);
    } catch (v) {
      if (h(l), v !== v + 0) throw v;
      p(1, 0);
    }
  }
  function ei(r, e, t, n, i, a, s) {
    var o = _();
    try {
      g(r)(e, t, n, i, a, s);
    } catch (u) {
      if (h(o), u !== u + 0) throw u;
      p(1, 0);
    }
  }
  function ti(r, e, t, n) {
    var i = _();
    try {
      return g(r)(e, t, n);
    } catch (a) {
      if (h(i), a !== a + 0) throw a;
      p(1, 0);
    }
  }
  function ni(r, e, t, n, i, a, s, o, u, f, l, v) {
    var d = _();
    try {
      return g(r)(e, t, n, i, a, s, o, u, f, l, v);
    } catch (m) {
      if (h(d), m !== m + 0) throw m;
      p(1, 0);
    }
  }
  function ii(r, e, t, n, i, a, s) {
    var o = _();
    try {
      return we(r, e, t, n, i, a, s);
    } catch (u) {
      if (h(o), u !== u + 0) throw u;
      p(1, 0);
    }
  }
  function ai(r, e, t, n, i) {
    var a = _();
    try {
      return $e(r, e, t, n, i);
    } catch (s) {
      if (h(a), s !== s + 0) throw s;
      p(1, 0);
    }
  }
  function si() {
    We();
    function r() {
      var e, t;
      c.calledRun = !0, !Vr && (De(), (e = Hr) === null || e === void 0 || e(c), (t = c.onRuntimeInitialized) === null || t === void 0 || t.call(c), Me());
    }
    c.setStatus ? (c.setStatus("Running..."), setTimeout(() => {
      setTimeout(() => c.setStatus(""), 1), r();
    }, 1)) : r();
  }
  var rr;
  return rr = await xe(), si(), zr ? O = c : O = new Promise((r, e) => {
    Hr = r, Br = e;
  }), O;
}
function Ae(R) {
  return ui(Wr, R);
}
function pi() {
  return fi(Wr);
}
function hi(R) {
  return Ae({
    overrides: R,
    equalityFn: Object.is,
    fireImmediately: !0
  });
}
function _i(R) {
  Ae({
    overrides: R,
    equalityFn: Object.is,
    fireImmediately: !1
  });
}
async function Se(R, O) {
  return ci(Wr, R, O);
}
async function gi(R, O) {
  return Se(R, O);
}
async function yi(R, O) {
  return Se(R, O);
}
const mi = "85d46f55d7c86a4d09bb04273367408b19c324f582d040d018aecb25a9a82942";
export {
  $i as ZXING_CPP_COMMIT,
  mi as ZXING_WASM_SHA256,
  Ti as ZXING_WASM_VERSION,
  Pi as barcodeFormats,
  Ci as binarizers,
  Ri as characterSets,
  Fi as contentTypes,
  Ai as defaultReaderOptions,
  Si as eanAddOnSymbols,
  hi as getZXingModule,
  ki as linearBarcodeFormats,
  Oi as matrixBarcodeFormats,
  Ae as prepareZXingModule,
  pi as purgeZXingModule,
  Se as readBarcodes,
  yi as readBarcodesFromImageData,
  gi as readBarcodesFromImageFile,
  _i as setZXingModuleOverrides,
  ji as textModes
};
