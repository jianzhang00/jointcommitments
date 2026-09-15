"""Revisión automática de metas contra los PDF originales.
Para cada fila: (1) ¿la cita literal está en la página citada?  (2) ¿las cifras de la meta están en esa página?
Para cada PDF: frases con cifra + verbo de compromiso que no corresponden a ninguna fila (posibles metas no recogidas)."""
import re, unicodedata, pandas as pd, pymupdf
from rapidfuzz import fuzz
PDF='pdfs2/'
C=lambda d: d['Ciudad / área']
DOC=lambda d: d['Documento'].fillna('')
PLANS = {  # plan: (pdf, filtro de filas en mi fichero, prefijo del plan en el master, idioma de las pistas)
 'Barcelona (ciudad) — PAG 2023-2027': ('BCN.pdf', lambda d: C(d)=='Barcelona (ciudad)', 'Barcelona City', 'ca'),
 'Barcelona (región metropolitana) — Compromís 2030': ('AMB.pdf', lambda d: C(d)=='Barcelona (región metropolitana)', 'Barcelona Metropolitan', 'ca'),
 'Freetown — Transforming Lives 2024-2028': ('FT24.pdf', lambda d: (C(d)=='Freetown') & DOC(d).str.contains('Transforming Lives'), 'Freetown — Transforming Lives', 'en'),
 'Freetown — Overview 2019-2022 (escaneado, OCR)': ('FT19.pdf', lambda d: (C(d)=='Freetown') & DOC(d).str.contains('Overview'), 'Freetown — Transform Freetown Overview', 'en'),
 'Greater Manchester Strategy 2025-35': ('GM.pdf', lambda d: C(d)=='Greater Manchester', 'Greater Manchester', 'en'),
 'Guangzhou — Plan Maestro 2021-2035': ('GZ.pdf', lambda d: (C(d)=='Guangzhou') & ~DOC(d).str.contains('Greater Bay'), 'Guangzhou — Territorial', 'zh'),
 'Gran Bahía (Guangdong–HK–Macao)': ('GBA.pdf', lambda d: DOC(d).str.contains('Greater Bay'), 'Guangdong', 'en'),
 'Estambul — Plan Estratégico 2025-2029': ('IST.pdf', lambda d: C(d)=='Estambul', 'Istanbul', 'tr'),
 'Johannesburgo — IDP 2026/27': ('JHB.pdf', lambda d: C(d)=='Johannesburgo', 'Johannesburg', 'en'),
 'Montreal — PUM 2050 Plan d’action': ('MTL.pdf', lambda d: C(d)=='Montreal', 'Montréal', 'fr'),
 'Seúl — 2040 Seoul Plan': ('SEO.pdf', lambda d: C(d)=='Seúl', 'Seoul', 'ko'),
 'Ciudad de México — PGD 2025-2045': ('CDMX.pdf', lambda d: C(d)=='Ciudad de México', 'Ciudad de México', 'es'),
 'Guadalajara — PDM/POTmet 2024': ('GDL.pdf', lambda d: C(d)=='Área Metropolitana de Guadalajara', 'Guadalajara', 'es'),
 'Toronto — Official Plan 2026': ('TOR.pdf', lambda d: C(d)=='Toronto', 'Toronto', 'en'),
}
def norm(s):
    s=unicodedata.normalize('NFKC',str(s)).lower()
    s=s.replace('’',"'").replace('l·l','ll').replace('•',' ')
    return re.sub(r'\s+',' ',s).strip()
def nums(s):
    """cifras de 2+ dígitos (sin separadores), excluyendo años sueltos"""
    out=set()
    for x in re.findall(r'\d[\d.,  ]*\d|\d', str(s)):
        d=re.sub(r'\D','',x).lstrip('0')
        if len(d)>=1: out.add(d)
    return out
def pages_of(p):
    s=str(p); out=set()
    for a,b in re.findall(r'(\d+)\s*[–-]\s*(\d+)',s): out|=set(range(int(a),int(b)+1))
    return out|{int(x) for x in re.findall(r'\d+',s)}
class Doc:
    def __init__(s,f):
        import os, json
        ocr=PDF+f.replace('.pdf','.ocr.json')
        if os.path.exists(ocr): s.raw=json.load(open(ocr))
        else: s.raw=[pg.get_text() for pg in pymupdf.open(PDF+f)]
        s.n=len(s.raw); s.txt=[norm(t) for t in s.raw]
        s.num=[nums(t) for t in s.raw]
    def near(s,P,k=1):
        return sorted({q for p in P for q in range(p-k,p+k+1) if 1<=q<=s.n})
def _tok(s): return [w for w in re.findall(r'\w{4,}',s) if not w.isdigit()]
def _cover(q,t):
    tk=_tok(q)
    if not tk: return 0
    return 100*sum(1 for w in tk if w in t)/len(tk)
def _score(q,t): return max(fuzz.partial_ratio(q,t), _cover(q,t))
def quote_check(doc,quote,P):
    q=norm(quote)
    if len(q)<15 or q.startswith('no localizado'): return 'sin cita',None,None
    # citas reconstruidas de tablas: «indicador — Baseline …; Target …» → se busca el indicador
    if ' — ' in q: q=q.split(' — ')[0]
    q=q[:250]
    best=(0,None)
    for p in doc.near(P):
        sc=_score(q,doc.txt[p-1]); best=max(best,(sc,p))
    if best[0]>=85: return 'cita en la página citada',best[1],round(best[0])
    allb=max((_score(q,t),i+1) for i,t in enumerate(doc.txt))
    if allb[0]>=85: return 'cita en otra página',allb[1],round(allb[0])
    return 'cita no encontrada',allb[1],round(allb[0])
def num_check(doc,value,P,texto=''):
    N={x for x in nums(value) if not re.fullmatch(r'(19|20)\d\d',x)} or {x for x in nums(texto) if not re.fullmatch(r'(19|20)\d\d',x)}
    if not N: return 'sin cifra', ''
    pages=doc.near(P) if P else []
    have=set().union(*[doc.num[p-1] for p in pages]) if pages else set()
    # cifras con decimales: comparar también sin el último grupo
    miss=[x for x in N if x not in have and not any(h.startswith(x) or x.startswith(h) and len(h)>=3 for h in have)]
    weak=all(len(x)<=2 for x in N)
    if not miss: return ('cifras en la página (cifra corta: prueba débil)' if weak else 'cifras en la página'), ''
    return 'cifra no encontrada en la página', ', '.join(sorted(miss))
def verdict(qc,nc):
    if qc=='cita en la página citada' and nc.startswith('cifras en'): return 'OK'
    if qc=='cita en la página citada' and nc=='sin cifra': return 'OK'
    if qc=='sin cita' and nc=='cifras en la página': return 'OK (solo cifra)'
    if qc=='sin cita' and nc.startswith('cifras en la página (cifra corta'): return 'Revisar a mano (solo cifra corta)'
    if qc=='sin cita': return 'Revisar a mano (sin cita ni cifra comprobable)' if nc=='sin cifra' else 'Revisar: cifra'
    if qc=='cita en otra página': return 'Revisar: página'
    if qc=='cita en la página citada': return 'Revisar: cifra'
    return 'Revisar: no localizada'
# ---------- cobertura
CUES={'ca':r"\b(objectiu|assolir|arribar|incrementar|augmentar|reduir|crear|construir|renovar|plantar|ampliar|impulsar|garantir|desplegar|invertir|inversió|habilitar|instal|actuar|nous?|noves)\b",
      'en':r"\b(target|achieve|increase|reduce|build|construct|create|plant|expand|train|install|establish|by 20\d\d|ensure|improve|provide|at least)\b",
      'es':r"\b(meta|alcanzar|incrementar|aumentar|reducir|disminuir|construir|crear|garantizar|lograr|al menos|para 20\d\d)\b",
      'fr':r"\b(cible|objectif|atteindre|augmenter|réduire|créer|construire|planter|ajouter|déployer|aménager|d'ici 20\d\d|au moins|minimalement)\b",
      'tr':r"(hedef|artır|azalt|oluştur|inşa|kurulu|yapıl|tamamlan|2029)",
      'zh':r"(到20\d\d年|不少于|不低于|达到|控制在|新增|规划|建设|保障|≥|≤)",
      'ko':r"(목표|달성|확대|감축|조성|구축|확충|증가|감소|개소|%|만\s?호)"}
def candidates(doc,lang):
    out=[]
    for i,t in enumerate(doc.raw):
        for s in re.split(r'(?<=[.;:!?])\s+|(?<=[。；])|\n(?=[•\-–·▪●])|\n{2,}', t):
            s1=re.sub(r'\s+',' ',s).strip()
            s1=re.sub(r"^\d{1,3} PLA D’ACCIÓ DE GOVERN 2023-2027 ",'',s1)
            if len(s1)<(12 if lang=='zh' else 25) or len(s1)>400: continue
            N={x for x in nums(s1) if len(x)>=2 and not re.fullmatch(r'(19|20)\d\d',x)}
            if not N or not re.search(CUES[lang],s1,re.I): continue
            out.append((i+1,s1,N))
    return out


# ---------------- run_rev.py ----------------
import pickle
from revision import *
U='/root/.claude/uploads/5ac52f4b-3e81-5f99-9a20-6ce6589595ba/'
MINE='/mnt/user-data/outputs/OBJETIVOS_URBANOS_FUSION_verificado.xlsx'
m=pd.read_excel(MINE,sheet_name='Objetivos'); m['Fila']=m.index+2
b=pd.read_excel(U+'49f9b7be-urban_plan_targets_MASTER_ENRICHED_QUOTES_THEMES_COINCIDENCIAS.xlsx',sheet_name='ALL_Targets'); b['Fila']=b.index+2
R1=[];R2=[];R3=[]
EN=dict(pd.read_pickle('en.pkl')[['row','en']].values)
for plan,(f,flt,mpref,lang) in PLANS.items():
    doc=Doc(f)
    mine=m[flt(m)]
    for _,r in mine.iterrows():
        P=pages_of(r['Pág. PDF'])
        qc,qp,qs=quote_check(doc,r['CITA LITERAL del documento original'],P)
        nc,miss=num_check(doc,r['Valor en el PDF'],P,r['Objetivo'])
        R1.append(dict(Plan=plan,Fuente='Mi fichero (Objetivos)',Fila=r.Fila,Objetivo=r.Objetivo,Valor=r['Valor en el PDF'],Pag=str(r['Pág. PDF']),
            Cita=qc,PagCita=qp,Similitud=qs,Cifras=nc,NoEncontradas=miss,Veredicto=verdict(qc,nc)))
    mas=b[b.Plan.str.startswith(mpref)]
    for _,r in mas.iterrows():
        P=pages_of(r['Physical PDF Page'])
        qc,qp,qs=quote_check(doc,r['CITA_LITERAL'],P)
        nc,miss=num_check(doc,r['Target / Commitment'],P,r['Objective / Indicator'])
        R1.append(dict(Plan=plan,Fuente='Master (ALL_Targets)',Fila=r.Fila,Objetivo=r['Objective / Indicator'],Valor=r['Target / Commitment'],Pag=str(r['Physical PDF Page']),
            Cita=qc,PagCita=qp,Similitud=qs,Cifras=nc,NoEncontradas=miss,Veredicto=verdict(qc,nc)))
    # cobertura: una frase candidata está recogida si hay una fila en su página (±1) que comparte cifras
    # o cuyo texto (cita literal / enunciado en inglés) se parece a la frase
    cov=[]
    for _,r in mine.iterrows():
        q=str(r['CITA LITERAL del documento original']); q='' if q.startswith(('NO LOCALIZ','(documento')) else q
        cov.append(('mine',pages_of(r['Pág. PDF']),{x for x in nums(str(r['Valor en el PDF'])+' '+str(r['Objetivo'])) if len(x)>=2},norm(q+' '+EN.get(r.Fila,''))))
    for _,r in mas.iterrows():
        cov.append(('master',pages_of(r['Physical PDF Page']),{x for x in nums(str(r['Target / Commitment'])+' '+str(r['Objective / Indicator'])) if len(x)>=2},norm(str(r['CITA_LITERAL'])+' '+str(r['Objective / Indicator']))))
    cands=candidates(doc,lang)
    def hit(src,p,s,N):
        sn=norm(s)
        for sr,P,NN,T in cov:
            if sr!=src: continue
            if P and p not in doc.near(P): continue
            if (N & NN) or (T and max(fuzz.partial_ratio(sn[:200],T), fuzz.token_set_ratio(sn,T))>=80): return True
        return False
    for p,s,N in cands:
        R3.append(dict(Plan=plan,Pag=p,Frase=s,EnMiFichero=hit('mine',p,s,N),EnMaster=hit('master',p,s,N)))
    R2.append(dict(Plan=plan,PDF=f,Paginas=doc.n,FilasMias=len(mine),FilasMaster=len(mas),Candidatas=len(cands)))
    print(plan,'done')
r1=pd.DataFrame(R1); r3=pd.DataFrame(R3); r2=pd.DataFrame(R2)
pickle.dump((r1,r2,r3),open('rev.pkl','wb'))
print(pd.crosstab([r1.Plan,r1.Fuente],r1.Veredicto))
print(r3.groupby('Plan')[['EnMiFichero','EnMaster']].agg(['sum','count']))


# ---------------- ist_parse.py ----------------
from revision import *
def is_val(x): return bool(re.fullmatch(r'(-|\d[\d.,:]*)',x))
def parse_ist(d):
    out=[]
    for p in range(1,d.n+1):
        L=[l.strip() for l in d.raw[p-1].split('\n')]
        i=0
        while i<len(L):
            if L[i]=='2029' and i>=5 and L[i-1]=='2028':
                i+=1; name=[]
                while i<len(L) and not L[i].startswith('Hedef Riski'):
                    l=L[i]
                    if not l: i+=1; continue
                    # unit line followed by weight number
                    if name and i+1<len(L) and re.fullmatch(r'\d{1,3}',L[i+1]) and not is_val(l) and len(l)<=12:
                        unit=l; w=L[i+1]; j=i+2; vals=[]
                        while j<len(L) and len(vals)<6:
                            toks=L[j].split()
                            if toks and all(is_val(t) for t in toks): vals+=toks; j+=1
                            else: break
                        out.append(dict(page=p,name=' '.join(name),unit=unit,weight=w,values=vals))
                        name=[]; i=j; continue
                    name.append(l); i+=1
            i+=1
    return out
