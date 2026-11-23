const $ = id => document.getElementById(id);
const fileInput=$('fileInput'), generateBtn=$('generateBtn'), errorBox=$('errorBox');
let sourceText='', questions=[], answers=[], current=0, reviewMode=false;

if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

fileInput.addEventListener('change', async e=>{const file=e.target.files[0]; if(file) await loadFile(file);});
const dropzone=$('dropzone');
['dragenter','dragover'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.add('drag')}));
['dragleave','drop'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.remove('drag')}));
dropzone.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f){fileInput.files=e.dataTransfer.files;loadFile(f)}});

async function loadFile(file){
  errorBox.textContent=''; generateBtn.disabled=true; sourceText='';
  $('fileName').textContent=file.name;
  try{
    const ext=file.name.split('.').pop().toLowerCase();
    if(ext==='txt') sourceText=await file.text();
    else if(ext==='pdf'){
      if(!window.pdfjsLib) throw new Error('تعذّر تحميل قارئ PDF. تحقق من اتصال الإنترنت ثم أعد المحاولة.');
      const data=new Uint8Array(await file.arrayBuffer());
      const pdf=await pdfjsLib.getDocument({data}).promise;
      let pages=[];
      for(let i=1;i<=pdf.numPages;i++){
        const page=await pdf.getPage(i), content=await page.getTextContent();
        pages.push(content.items.map(x=>x.str).join(' '));
      }
      sourceText=pages.join('\n');
    } else throw new Error('نوع الملف غير مدعوم. اختر PDF أو TXT.');
    sourceText=sourceText.replace(/\s+/g,' ').trim();
    if(sourceText.length<100) throw new Error('لم أستطع استخراج نص كافٍ. قد تكون الملزمة صوراً ممسوحة ضوئياً؛ جرّب نسخة PDF قابلة لتحديد النص أو ملف TXT.');
    $('fileInfo').hidden=false;
    $('fileInfo').textContent=`تم استخراج ${sourceText.length.toLocaleString()} حرفاً من الملزمة بنجاح.`;
    generateBtn.disabled=false;
  }catch(err){errorBox.textContent=err.message||'حدث خطأ أثناء قراءة الملف.';$('fileInfo').hidden=true;}
}

function makeQuestions(text,count){
  const raw=text.replace(/\s+/g,' ').match(/[^.!?؟؛]+[.!?؟؛]?/g)||[];
  const sentences=raw.map(s=>s.trim()).filter(s=>s.length>=38&&s.length<=320);
  const stop=new Set(('the and for with that this from into your have has are was were will can you one more forms media text then than when what which who how its their they them about also such only not but use used using users page example examples allows does lets addition before after entire completely browser listening watching stream streams download file called means refers includes including').split(' '));
  const words=text.match(/[A-Za-z][A-Za-z'-]{3,}|[\u0600-\u06FF]{4,}/g)||[];
  const freq={};words.forEach(w=>{let k=w.toLowerCase();if(!stop.has(k))freq[k]=(freq[k]||0)+1});
  const vocab=Object.keys(freq).sort((x,y)=>freq[y]-freq[x]),used=new Set(),out=[];
  function distractors(answer,sentence){
    return vocab.filter(w=>w!==answer&&!sentence.toLowerCase().includes(w))
      .sort((x,y)=>Math.abs(x.length-answer.length)-Math.abs(y.length-answer.length))
      .slice(0,3);
  }
  // Detect explicit definitions first, then create contextual questions.
  const patterns=[
    /^(.{2,65}?)\s+(?:is|are|means|refers to|defined as)\s+(.{12,220})$/i,
    /^(.{2,65}?)\s+(?:هو|هي|يعني|تعني|يُعرّف بأنه|تعرف بأنها)\s+(.{12,220})$/i
  ];
  for(const s of sentences){
    if(out.length>=count)break;
    let m=null;for(const p of patterns){m=s.match(p);if(m)break}
    if(!m)continue;
    const answer=m[1].trim(),key=answer.toLowerCase(),ds=distractors(key,s);
    if(answer.length<3||answer.split(/\s+/).length>7||used.has(key)||ds.length<3)continue;
    used.add(key);
    out.push({kind:'definition',prompt:s.replace(m[1],'________'),answer,options:[answer,...ds].sort(()=>Math.random()-.5),explanation:s});
  }
  for(const s of sentences){
    if(out.length>=count)break;
    const low=s.toLowerCase();
    const candidates=vocab.filter(w=>!used.has(w)&&low.includes(w)&&w.length>=4)
      .sort((x,y)=>(freq[y]*Math.min(y.length,14))-(freq[x]*Math.min(x.length,14)));
    for(const word of candidates){
      const at=low.indexOf(word),ds=distractors(word,s);
      if(at<3||ds.length<3)continue;
      used.add(word);
      out.push({kind:'context',prompt:s.slice(0,at)+'________'+s.slice(at+word.length),answer:word,options:[word,...ds].sort(()=>Math.random()-.5),explanation:s});
      break;
    }
  }
  return out;
}

generateBtn.addEventListener('click',()=>{
  const count=Number($('questionCount').value);
  if(!Number.isInteger(count)||count<1||count>50){errorBox.textContent='أدخل عدداً صحيحاً من 1 إلى 50.';return;}
  questions=makeQuestions(sourceText,count);
  if(!questions.length){errorBox.textContent='لم أتمكن من تكوين أسئلة كافية من النص. جرّب ملزمة تحتوي على نص واضح وجمل كاملة.';return;}
  if(questions.length<count) errorBox.textContent=`ملاحظة: أمكن إنشاء ${questions.length} سؤالاً فقط من النص المستخرج.`;
  answers=Array(questions.length).fill(null);current=0;reviewMode=false;
  $('setupPanel').hidden=true;$('resultPanel').hidden=true;$('quizPanel').hidden=false;
  $('quizTitle').textContent=fileInput.files[0]?.name||'اختبار الملزمة';
  renderQuestion();
});

function renderQuestion(){
  const q=questions[current],lang=$('quizLanguage').value;
  $('questionCounter').textContent=lang==='en'?`Question ${current+1} of ${questions.length}`:`السؤال ${current+1} من ${questions.length}`;
  $('progressPercent').textContent=`${Math.round((current+1)/questions.length*100)}%`;
  $('progressBar').style.width=`${(current+1)/questions.length*100}%`;
  $('questionType').textContent=q.kind==='definition'?(lang==='en'?'Identify the term from its definition':'حدّد المصطلح من تعريفه'):(lang==='en'?'Understand the context and complete the statement':'افهم السياق وأكمل العبارة');
  $('questionText').textContent=(lang==='en'?(q.kind==='definition'?'Which term completes this definition? ':'Choose the term that best completes the statement: '):(q.kind==='definition'?'ما المصطلح الذي يكمل هذا التعريف؟ ':'اختر المصطلح الأنسب لإكمال العبارة: '))+q.prompt;
  $('options').innerHTML='';$('feedback').textContent='';$('feedback').className='feedback';
  q.options.forEach((opt,i)=>{
    const b=document.createElement('button');b.type='button';b.className='option';
    const letter=document.createElement('span');letter.className='letter';letter.textContent=String.fromCharCode(65+i);
    const label=document.createElement('span');label.textContent=opt;
    b.append(letter,label);
    if(answers[current]!==null){b.disabled=true;if(opt===q.answer)b.classList.add('correct');else if(opt===answers[current])b.classList.add('wrong')}
    b.addEventListener('click',()=>selectAnswer(opt));$('options').appendChild(b);
  });
  if(answers[current]!==null){
    $('feedback').textContent=answers[current]===q.answer?(lang==='en'?`Correct. Source context: ${q.explanation}`:`إجابة صحيحة. سياقها في الملزمة: ${q.explanation}`):(lang==='en'?`The correct answer is: ${q.answer}. Source context: ${q.explanation}`:`الإجابة الصحيحة: ${q.answer}. سياقها في الملزمة: ${q.explanation}`);
    $('feedback').classList.add(answers[current]===q.answer?'good':'bad');
  }
  $('prevBtn').disabled=current===0;
  $('nextBtn').disabled=answers[current]===null;
  $('nextBtn').textContent=current===questions.length-1?(lang==='en'?'Finish':'إنهاء'):(lang==='en'?'Next →':'التالي ←');
}
function selectAnswer(opt){if(answers[current]!==null)return;answers[current]=opt;renderQuestion()}
$('nextBtn').addEventListener('click',()=>{if(current<questions.length-1){current++;renderQuestion()}else showResults()});
$('prevBtn').addEventListener('click',()=>{if(current>0){current--;renderQuestion()}});
function showResults(){
  const score=answers.filter((a,i)=>a===questions[i].answer).length,lang=$('quizLanguage').value;
  $('quizPanel').hidden=true;$('resultPanel').hidden=false;
  $('scoreText').textContent=`${score} / ${questions.length}`;
  $('scoreMessage').textContent=lang==='en'?`You answered ${score} out of ${questions.length} questions correctly.`:`أجبت إجابة صحيحة عن ${score} من أصل ${questions.length} سؤالاً.`;
}
$('reviewBtn').addEventListener('click',()=>{current=0;$('resultPanel').hidden=true;$('quizPanel').hidden=false;renderReview()});
function renderReview(){renderQuestion();$('questionType').textContent=$('quizLanguage').value==='en'?'Answer review':'مراجعة الإجابات';$('nextBtn').disabled=false;}
$('newQuizBtn').addEventListener('click',resetAll);$('restartBtn').addEventListener('click',resetAll);
function resetAll(){questions=[];answers=[];current=0;sourceText='';fileInput.value='';$('fileName').textContent='لم يتم اختيار ملف بعد';$('fileInfo').hidden=true;$('errorBox').textContent='';generateBtn.disabled=true;$('resultPanel').hidden=true;$('quizPanel').hidden=true;$('setupPanel').hidden=false;}

// Dark mode is the default; switch instantly to light mode when requested.
const themeToggle=$('themeToggle');
function setTheme(light){
  document.body.classList.toggle('light-theme',light);
  themeToggle.innerHTML=light?'🌙 <span>الوضع الليلي</span>':'☀️ <span>الوضع النهاري</span>';
  themeToggle.setAttribute('aria-label',light?'تفعيل الوضع الليلي':'تفعيل الوضع النهاري');
}
themeToggle.addEventListener('click',()=>setTheme(!document.body.classList.contains('light-theme')));
