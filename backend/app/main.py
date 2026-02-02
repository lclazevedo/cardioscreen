"""CardioScreen Backend - Sistema de Triagem TAVI com IA
FastAPI + Anthropic Claude + PostgreSQL Learning System
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Query, Depends, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import anthropic
import PyPDF2
import io
import json
import os
import base64
import uuid
from datetime import datetime, timedelta
from dotenv import load_dotenv

from .database import (
    init_db, get_db, get_active_lessons, format_lessons_for_prompt,
    LaudoProcessado as LaudoDB, LessonLearned, Feedback
)

load_dotenv()

app = FastAPI(
    title="CardioScreen API",
    description="Sistema de triagem automatizada de estenose aórtica com aprendizado contínuo",
    version="3.0.0"
)

# Initialize database on startup
@app.on_event("startup")
async def startup_event():
    try:
        init_db()
        print("✅ CardioScreen API started with PostgreSQL")
    except Exception as e:
        print(f"⚠️ Database initialization failed: {e}")
        print("⚠️ Running in memory-only mode")

# CORS para desenvolvimento e produção
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuração Anthropic
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
USE_API = os.getenv("USE_API", "true").strip().lower() in {"1", "true", "yes", "y", "on"}
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if USE_API else None

# Modelos de IA
MODEL_ANALYSIS = "claude-haiku-4-5-20251001"  # Para análises (barato)
MODEL_LEARNING = "claude-sonnet-4-5-20250929"  # Para aprendizado (avançado)

# Fallback: banco em memória quando PostgreSQL não está disponível
laudos_db: Dict[str, Any] = {}
USE_DATABASE = os.getenv("DATABASE_URL") is not None

# Pasta para armazenar arquivos originais
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

# Models
class DadosPaciente(BaseModel):
    nome: Optional[str] = None
    idade: Optional[int] = None
    sexo: Optional[str] = None
    data_exame: Optional[str] = None

class EcoResult(BaseModel):
    tem_estenose: bool
    gravidade: str
    area_valvar: Optional[float] = None
    gradiente_medio: Optional[float] = None
    velocidade_maxima: Optional[float] = None
    prioridade: str
    justificativa: str
    indicacao_tavi: bool
    confianca: float
    paciente: Optional[DadosPaciente] = None

class LaudoProcessado(BaseModel):
    id: str
    arquivo: str
    formato: str
    timestamp: str
    analise: EcoResult
    texto_original: Optional[str] = None
    encaminhado: bool = False
    data_encaminhamento: Optional[str] = None

class BatchResult(BaseModel):
    total_processados: int
    para_revisao: int
    laudos: List[LaudoProcessado]

class StatsResponse(BaseModel):
    total_laudos: int
    indicacao_tavi: int
    prioridade_alta: int
    prioridade_media: int
    prioridade_baixa: int
    encaminhados: int
    periodo: str

class EncaminharRequest(BaseModel):
    laudo_id: str
    encaminhado: bool

class EditarLaudoRequest(BaseModel):
    laudo_id: str
    campo: str
    valor: Any

# Formatos suportados
FORMATOS_SUPORTADOS = {
    '.pdf': 'pdf',
    '.txt': 'texto',
    '.doc': 'documento',
    '.docx': 'documento',
    '.png': 'imagem',
    '.jpg': 'imagem',
    '.jpeg': 'imagem',
    '.webp': 'imagem',
    '.gif': 'imagem',
    '.bmp': 'imagem'
}

def extrair_texto_pdf(pdf_bytes: bytes) -> str:
    """Extrai texto de PDF. Retorna string vazia se PDF for imagem escaneada."""
    try:
        pdf_file = io.BytesIO(pdf_bytes)
        reader = PyPDF2.PdfReader(pdf_file)
        texto = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                texto += page_text + "\n"
        return texto.strip()
    except Exception as e:
        print(f"[PDF] Erro ao extrair texto: {e}")
        return ""  # Retorna vazio para tentar como imagem

def converter_pdf_para_imagem(pdf_bytes: bytes) -> bytes:
    """Converte primeira página do PDF para imagem JPEG usando pymupdf (fitz)."""
    # Tentar com pymupdf (não precisa de Poppler)
    try:
        import fitz  # pymupdf
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if len(doc) > 0:
            page = doc[0]
            # Renderizar com zoom moderado para manter qualidade mas reduzir tamanho
            mat = fitz.Matrix(1.5, 1.5)  # 1.5x zoom
            pix = page.get_pixmap(matrix=mat)
            
            # Converter para JPEG com compressão para reduzir tamanho
            from PIL import Image
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            img_byte_arr = io.BytesIO()
            img.save(img_byte_arr, format='JPEG', quality=85, optimize=True)
            img_bytes = img_byte_arr.getvalue()
            
            doc.close()
            print(f"[PDF] Convertido com pymupdf: {len(img_bytes)} bytes ({len(img_bytes)/1024/1024:.2f} MB)")
            
            # Se ainda for muito grande, reduzir mais
            if len(img_bytes) > 4 * 1024 * 1024:  # > 4MB
                print("[PDF] Imagem muito grande, reduzindo qualidade...")
                img_byte_arr = io.BytesIO()
                img = img.resize((img.width // 2, img.height // 2), Image.Resampling.LANCZOS)
                img.save(img_byte_arr, format='JPEG', quality=75, optimize=True)
                img_bytes = img_byte_arr.getvalue()
                print(f"[PDF] Reduzido para: {len(img_bytes)} bytes ({len(img_bytes)/1024/1024:.2f} MB)")
            
            return img_bytes
    except ImportError as e:
        print(f"[PDF] Dependência faltando: {e}")
    except Exception as e:
        print(f"[PDF] Erro ao converter com pymupdf: {e}")
    
    # Fallback para pdf2image (precisa de Poppler)
    try:
        from pdf2image import convert_from_bytes
        images = convert_from_bytes(pdf_bytes, first_page=1, last_page=1, dpi=150)
        if images:
            img_byte_arr = io.BytesIO()
            images[0].save(img_byte_arr, format='PNG')
            img_byte_arr.seek(0)
            return img_byte_arr.read()
    except ImportError:
        print("[PDF] pdf2image não instalado")
    except Exception as e:
        print(f"[PDF] Erro ao converter com pdf2image: {e}")
    
    return None

def extrair_texto_txt(file_bytes: bytes) -> str:
    try:
        return file_bytes.decode('utf-8')
    except:
        try:
            return file_bytes.decode('latin-1')
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erro ao ler arquivo de texto: {str(e)}")

def get_prompt_base(lessons_text: str = "") -> str:
    base = """Você é um especialista em cardiologia especializado em avaliação de estenose aórtica para indicação TAVI.

Analise este laudo de ecocardiograma e extraia:

1. DADOS DO PACIENTE: nome, idade, sexo, data do exame
2. Presença de estenose aórtica?
3. Gravidade: ausente/leve/moderada/importante/grave
4. Área valvar aórtica (cm²)
5. Gradiente médio transvalvar (mmHg)
6. Velocidade máxima (m/s)

PRIORIDADE:
- ALTA: Estenose importante/grave E (área <1.0cm² OU gradiente >40mmHg OU velocidade >4m/s)
- MÉDIA: Moderada/importante OU área 1.0-1.5cm² OU gradiente 30-40mmHg
- BAIXA: Leve/ausente OU área >1.5cm² E gradiente <30mmHg

Responda APENAS com JSON válido (sem markdown, sem explicações):
{
    "tem_estenose": true/false,
    "gravidade": "ausente|leve|moderada|importante|grave",
    "area_valvar": número ou null,
    "gradiente_medio": número ou null,
    "velocidade_maxima": número ou null,
    "prioridade": "alta|media|baixa",
    "justificativa": "string explicando a análise",
    "indicacao_tavi": true/false,
    "confianca": número entre 0.0 e 1.0,
    "paciente": {
        "nome": "string ou null",
        "idade": número ou null,
        "sexo": "M|F ou null",
        "data_exame": "string no formato DD/MM/AAAA ou null"
    }
}"""
    
    if lessons_text:
        base += lessons_text
    
    return base

def _mock_eco_result() -> EcoResult:
    import random

    gravidade = random.choice(["ausente", "leve", "moderada", "importante", "grave"])
    if gravidade == "grave":
        area_valvar = round(random.uniform(0.6, 0.9), 2)
        gradiente_medio = round(random.uniform(45, 65), 1)
        velocidade_maxima = round(random.uniform(4.2, 5.5), 2)
        prioridade = "alta"
        indicacao_tavi = True
    elif gravidade == "importante":
        area_valvar = round(random.uniform(0.9, 1.2), 2)
        gradiente_medio = round(random.uniform(35, 45), 1)
        velocidade_maxima = round(random.uniform(3.8, 4.6), 2)
        prioridade = "alta"
        indicacao_tavi = True
    elif gravidade == "moderada":
        area_valvar = round(random.uniform(1.2, 1.5), 2)
        gradiente_medio = round(random.uniform(25, 35), 1)
        velocidade_maxima = round(random.uniform(3.0, 4.0), 2)
        prioridade = "media"
        indicacao_tavi = False
    elif gravidade == "leve":
        area_valvar = round(random.uniform(1.5, 2.0), 2)
        gradiente_medio = round(random.uniform(15, 25), 1)
        velocidade_maxima = round(random.uniform(2.2, 3.3), 2)
        prioridade = "baixa"
        indicacao_tavi = False
    else:
        area_valvar = round(random.uniform(2.0, 3.0), 2)
        gradiente_medio = round(random.uniform(5, 15), 1)
        velocidade_maxima = round(random.uniform(1.5, 2.5), 2)
        prioridade = "baixa"
        indicacao_tavi = False

    return EcoResult(
        tem_estenose=gravidade != "ausente",
        gravidade=gravidade,
        area_valvar=area_valvar,
        gradiente_medio=gradiente_medio,
        velocidade_maxima=velocidade_maxima,
        prioridade=prioridade,
        justificativa=f"(mock) Análise simulada: gravidade={gravidade}, AVA={area_valvar} cm², gradiente={gradiente_medio} mmHg.",
        indicacao_tavi=indicacao_tavi,
        confianca=round(random.uniform(0.75, 0.95), 2),
        paciente={
            "nome": None,
            "idade": None,
            "sexo": None,
            "data_exame": None,
        },
    )

def analisar_laudo_claude(texto_laudo: str, lessons_text: str = "") -> EcoResult:
    print(f"[Análise] analisar_laudo_claude chamado")
    print(f"[Análise] Lessons text presente: {bool(lessons_text)}")
    if lessons_text:
        print(f"[Análise] Lessons text (primeiros 300 chars): {lessons_text[:300]}...")
    
    if not USE_API or client is None:
        print("[Análise] USE_API=false, retornando mock")
        return _mock_eco_result()
    
    prompt = f"""{get_prompt_base(lessons_text)}

LAUDO:
{texto_laudo}"""

    print(f"[Análise] Enviando para Claude {MODEL_ANALYSIS}...")
    print(f"[Análise] Lessons no prompt: {len(lessons_text)} caracteres")
    print(f"[Análise] PROMPT COMPLETO ENVIADO:\n{'='*60}\n{prompt}\n{'='*60}")
    try:
        message = client.messages.create(
            model=MODEL_ANALYSIS,
            max_tokens=1000,
            temperature=0.1,
            messages=[{"role": "user", "content": prompt}]
        )
        
        resposta_texto = message.content[0].text.strip()
        print(f"[Análise] Resposta Claude: {resposta_texto[:200]}...")
        
        if resposta_texto.startswith("```json"):
            resposta_texto = resposta_texto.split("```json")[1].split("```")[0].strip()
        elif resposta_texto.startswith("```"):
            resposta_texto = resposta_texto.split("```")[1].split("```")[0].strip()
        
        dados = json.loads(resposta_texto)
        print(f"[Análise] Resultado: gravidade={dados.get('gravidade')}, prioridade={dados.get('prioridade')}")
        return EcoResult(**dados)
    
    except json.JSONDecodeError as e:
        print(f"[Análise] ERRO JSON: {e}")
        raise HTTPException(status_code=500, detail=f"Erro JSON: {str(e)}")
    except Exception as e:
        print(f"[Análise] ERRO: {e}")
        raise HTTPException(status_code=500, detail=f"Erro: {str(e)}")

def analisar_imagem_claude(image_bytes: bytes, media_type: str, lessons_text: str = "") -> EcoResult:
    if not USE_API or client is None:
        return _mock_eco_result()
    prompt = f"""{get_prompt_base(lessons_text)}

A imagem anexada contém um laudo de ecocardiograma. Extraia as informações e analise."""

    print(f"[Análise] Enviando IMAGEM para Claude {MODEL_ANALYSIS}...")
    print(f"[Análise] Lessons no prompt: {len(lessons_text)} caracteres")
    print(f"[Análise] PROMPT COMPLETO ENVIADO (IMAGEM):\n{'='*60}\n{prompt}\n{'='*60}")

    try:
        image_data = base64.standard_b64encode(image_bytes).decode("utf-8")
        
        message = client.messages.create(
            model=MODEL_ANALYSIS,
            max_tokens=1000,
            temperature=0.1,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data
                        }
                    },
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }]
        )
        
        resposta_texto = message.content[0].text.strip()
        
        if resposta_texto.startswith("```json"):
            resposta_texto = resposta_texto.split("```json")[1].split("```")[0].strip()
        elif resposta_texto.startswith("```"):
            resposta_texto = resposta_texto.split("```")[1].split("```")[0].strip()
        
        dados = json.loads(resposta_texto)
        return EcoResult(**dados)
    
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Erro JSON: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro: {str(e)}")

def get_media_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    media_types = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp'
    }
    return media_types.get(ext, 'image/png')

@app.get("/")
async def root():
    return {
        "status": "online",
        "app": "CardioScreen API",
        "version": "3.0.0",
        "model": MODEL_ANALYSIS,
        "learning_model": MODEL_LEARNING,
        "database": "PostgreSQL" if USE_DATABASE else "memory",
        "formatos_suportados": list(FORMATOS_SUPORTADOS.keys())
    }

@app.post("/analisar-arquivo")
async def analisar_arquivo(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Analisa um único arquivo (PDF, imagem, txt) com conhecimento aprendido"""
    filename = file.filename or "arquivo"
    ext = os.path.splitext(filename)[1].lower()
    
    if ext not in FORMATOS_SUPORTADOS:
        raise HTTPException(
            status_code=400, 
            detail=f"Formato não suportado. Use: {', '.join(FORMATOS_SUPORTADOS.keys())}"
        )
    
    file_bytes = await file.read()
    formato = FORMATOS_SUPORTADOS[ext]
    
    # Buscar lessons ativas do banco de dados
    lessons_text = ""
    lessons_count = 0
    if USE_DATABASE:
        try:
            lessons = get_active_lessons(db)
            lessons_count = len(lessons)
            lessons_text = format_lessons_for_prompt(lessons)
        except Exception as e:
            print(f"⚠️ Could not fetch lessons: {e}")
    
    # Processar baseado no formato
    if formato == 'pdf':
        texto = extrair_texto_pdf(file_bytes)
        if len(texto) < 20:
            # PDF sem texto - tentar como imagem escaneada
            print(f"[PDF] Texto insuficiente ({len(texto)} chars), tentando como imagem...")
            pdf_image = converter_pdf_para_imagem(file_bytes)
            if pdf_image:
                print("[PDF] Convertido para imagem, analisando com visão computacional...")
                analise = analisar_imagem_claude(pdf_image, "image/jpeg", lessons_text)
                texto = "[PDF-Imagem analisado por visão computacional]"
                formato = "imagem"  # Atualizar formato para imagem
            else:
                raise HTTPException(status_code=400, detail="PDF sem texto extraível e não foi possível converter para imagem. Instale pdf2image e poppler.")
        else:
            analise = analisar_laudo_claude(texto, lessons_text)
    elif formato == 'texto':
        texto = extrair_texto_txt(file_bytes)
        if len(texto) < 20:
            raise HTTPException(status_code=400, detail="Arquivo de texto vazio")
        analise = analisar_laudo_claude(texto, lessons_text)
    elif formato == 'imagem':
        media_type = get_media_type(filename)
        analise = analisar_imagem_claude(file_bytes, media_type, lessons_text)
        texto = "[Imagem analisada por visão computacional]"
    else:
        raise HTTPException(status_code=400, detail="Formato não implementado")
    
    # Criar laudo e salvar no banco
    laudo_id = str(uuid.uuid4())
    
    # Salvar arquivo original
    file_ext = os.path.splitext(filename)[1].lower()
    arquivo_salvo = f"{laudo_id}{file_ext}"
    arquivo_path = os.path.join(UPLOADS_DIR, arquivo_salvo)
    with open(arquivo_path, "wb") as f:
        f.write(file_bytes)
    
    # Criar resposta Pydantic
    laudo_pydantic = LaudoProcessado(
        id=laudo_id,
        arquivo=filename,
        formato=formato,
        timestamp=datetime.now().isoformat(),
        analise=analise,
        texto_original=texto if texto else None,
        encaminhado=False
    )
    
    laudo_dict = laudo_pydantic.model_dump()
    laudo_dict["arquivo_original"] = arquivo_salvo
    laudo_dict["lessons_count"] = lessons_count
    
    # Salvar no PostgreSQL se disponível
    print(f"[Salvamento] USE_DATABASE={USE_DATABASE}")
    if USE_DATABASE:
        try:
            print(f"[Salvamento] Tentando salvar laudo {filename} no banco...")
            laudo_db = LaudoDB(
                arquivo=filename,
                arquivo_tipo=formato,
                arquivo_path=arquivo_salvo,
                texto_original=texto if texto else None,
                analise=laudo_dict["analise"],
                lessons_count=lessons_count,
                modelo_ia=MODEL_ANALYSIS
            )
            db.add(laudo_db)
            db.commit()
            db.refresh(laudo_db)
            laudo_dict["db_id"] = laudo_db.id  # ID do banco para feedback
            print(f"[Salvamento] ✅ Laudo salvo no banco com db_id={laudo_db.id}")
        except Exception as e:
            print(f"[Salvamento] ❌ ERRO ao salvar no banco: {e}")
            import traceback
            traceback.print_exc()
            db.rollback()
    else:
        print(f"[Salvamento] ⚠️ USE_DATABASE=False, não salvando no banco")
    
    # Fallback: salvar em memória também
    laudos_db[laudo_id] = laudo_dict
    print(f"[Salvamento] Laudo salvo em memória com id={laudo_id}, db_id={laudo_dict.get('db_id')}")
    
    return laudo_dict

@app.post("/processar-lote")
async def processar_lote(arquivos: List[UploadFile] = File(...)):
    """Processa múltiplos arquivos e retorna resultados"""
    if len(arquivos) > 100:
        raise HTTPException(status_code=400, detail="Máximo 100 arquivos por vez")
    
    resultados = []
    erros = []
    
    for arquivo in arquivos:
        try:
            filename = arquivo.filename or "arquivo"
            ext = os.path.splitext(filename)[1].lower()
            
            if ext not in FORMATOS_SUPORTADOS:
                erros.append({"arquivo": filename, "erro": "Formato não suportado"})
                continue
            
            file_bytes = await arquivo.read()
            formato = FORMATOS_SUPORTADOS[ext]
            
            # Processar baseado no formato
            if formato == 'pdf':
                texto = extrair_texto_pdf(file_bytes)
                analise = analisar_laudo_claude(texto)
            elif formato == 'texto':
                texto = extrair_texto_txt(file_bytes)
                analise = analisar_laudo_claude(texto)
            elif formato == 'imagem':
                media_type = get_media_type(filename)
                analise = analisar_imagem_claude(file_bytes, media_type)
                texto = "[Imagem]"
            else:
                erros.append({"arquivo": filename, "erro": "Formato não implementado"})
                continue
            
            laudo_id = str(uuid.uuid4())
            laudo = LaudoProcessado(
                id=laudo_id,
                arquivo=filename,
                formato=formato,
                timestamp=datetime.now().isoformat(),
                analise=analise,
                texto_original=texto if texto else None,
                encaminhado=False
            )
            
            laudos_db[laudo_id] = laudo.model_dump()
            resultados.append(laudo)
            
        except Exception as e:
            erros.append({"arquivo": arquivo.filename, "erro": str(e)})
            continue
    
    return {
        "total_processados": len(resultados),
        "total_erros": len(erros),
        "para_revisao": len([r for r in resultados if r.analise.prioridade in ["alta", "media"]]),
        "laudos": resultados,
        "erros": erros
    }

@app.get("/laudos")
async def listar_laudos(
    periodo: str = Query("todos", description="dia, semana, mes, todos"),
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Lista todos os laudos com filtro por período"""
    # Buscar do banco de dados se disponível
    if USE_DATABASE:
        query = db.query(LaudoDB)
        
        # Filtrar por período
        agora = datetime.now()
        if periodo == "dia":
            inicio = agora - timedelta(days=1)
            query = query.filter(LaudoDB.created_at >= inicio)
        elif periodo == "semana":
            inicio = agora - timedelta(weeks=1)
            query = query.filter(LaudoDB.created_at >= inicio)
        elif periodo == "mes":
            inicio = agora - timedelta(days=30)
            query = query.filter(LaudoDB.created_at >= inicio)
        elif data_inicio and data_fim:
            inicio = datetime.fromisoformat(data_inicio)
            fim = datetime.fromisoformat(data_fim)
            query = query.filter(LaudoDB.created_at >= inicio, LaudoDB.created_at <= fim)
        
        laudos_db_result = query.order_by(LaudoDB.created_at.desc()).all()
        
        laudos = [
            {
                "id": str(l.id),  # Usar ID do banco como string
                "db_id": l.id,
                "arquivo": l.arquivo,
                "formato": l.arquivo_tipo,
                "timestamp": l.created_at.isoformat() if l.created_at else None,
                "analise": l.analise,
                "texto_original": l.texto_original,
                "encaminhado": False,
                "lessons_count": l.lessons_count,
                "recebeu_feedback": l.recebeu_feedback,
                "editado_manualmente": l.editado_manualmente,
                "editado_em": l.editado_em.isoformat() if l.editado_em else None,
                "corrigido_em": l.corrigido_em.isoformat() if l.corrigido_em else None,
                "arquivo_original": l.arquivo_path
            }
            for l in laudos_db_result
        ]
        return {"laudos": laudos, "total": len(laudos)}
    
    # Fallback para memória
    laudos = list(laudos_db.values())
    
    # Filtrar por período
    agora = datetime.now()
    if periodo == "dia":
        inicio = agora - timedelta(days=1)
    elif periodo == "semana":
        inicio = agora - timedelta(weeks=1)
    elif periodo == "mes":
        inicio = agora - timedelta(days=30)
    elif data_inicio and data_fim:
        inicio = datetime.fromisoformat(data_inicio)
        fim = datetime.fromisoformat(data_fim)
        laudos = [l for l in laudos if inicio <= datetime.fromisoformat(l["timestamp"]) <= fim]
        return {"laudos": laudos, "total": len(laudos)}
    else:
        return {"laudos": laudos, "total": len(laudos)}
    
    laudos = [l for l in laudos if datetime.fromisoformat(l["timestamp"]) >= inicio]
    return {"laudos": laudos, "total": len(laudos)}

@app.get("/estatisticas")
async def obter_estatisticas(
    periodo: str = Query("todos", description="dia, semana, mes, todos"),
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Retorna estatísticas dos laudos por período"""
    # Buscar do banco de dados se disponível
    if USE_DATABASE:
        query = db.query(LaudoDB)
        
        # Filtrar por período
        agora = datetime.now()
        if periodo == "dia":
            inicio = agora - timedelta(days=1)
            query = query.filter(LaudoDB.created_at >= inicio)
        elif periodo == "semana":
            inicio = agora - timedelta(weeks=1)
            query = query.filter(LaudoDB.created_at >= inicio)
        elif periodo == "mes":
            inicio = agora - timedelta(days=30)
            query = query.filter(LaudoDB.created_at >= inicio)
        elif data_inicio and data_fim:
            inicio = datetime.fromisoformat(data_inicio)
            fim = datetime.fromisoformat(data_fim)
            query = query.filter(LaudoDB.created_at >= inicio, LaudoDB.created_at <= fim)
        
        laudos_db_result = query.all()
        
        # Converter para formato compatível
        laudos = [{"analise": l.analise, "encaminhado": False} for l in laudos_db_result]
    else:
        laudos = list(laudos_db.values())
        
        # Filtrar por período
        agora = datetime.now()
        if periodo == "dia":
            inicio = agora - timedelta(days=1)
            laudos = [l for l in laudos if datetime.fromisoformat(l["timestamp"]) >= inicio]
        elif periodo == "semana":
            inicio = agora - timedelta(weeks=1)
            laudos = [l for l in laudos if datetime.fromisoformat(l["timestamp"]) >= inicio]
        elif periodo == "mes":
            inicio = agora - timedelta(days=30)
            laudos = [l for l in laudos if datetime.fromisoformat(l["timestamp"]) >= inicio]
        elif data_inicio and data_fim:
            inicio = datetime.fromisoformat(data_inicio)
            fim = datetime.fromisoformat(data_fim)
            laudos = [l for l in laudos if inicio <= datetime.fromisoformat(l["timestamp"]) <= fim]
    
    return {
        "periodo": periodo,
        "total_laudos": len(laudos),
        "indicacao_tavi": len([l for l in laudos if l["analise"].get("indicacao_tavi")]),
        "prioridade_alta": len([l for l in laudos if l["analise"].get("prioridade") == "alta"]),
        "prioridade_media": len([l for l in laudos if l["analise"].get("prioridade") == "media"]),
        "prioridade_baixa": len([l for l in laudos if l["analise"].get("prioridade") == "baixa"]),
        "encaminhados": len([l for l in laudos if l.get("encaminhado", False)]),
        "por_gravidade": {
            "ausente": len([l for l in laudos if l["analise"].get("gravidade") == "ausente"]),
            "leve": len([l for l in laudos if l["analise"].get("gravidade") == "leve"]),
            "moderada": len([l for l in laudos if l["analise"].get("gravidade") == "moderada"]),
            "importante": len([l for l in laudos if l["analise"].get("gravidade") == "importante"]),
            "grave": len([l for l in laudos if l["analise"].get("gravidade") == "grave"]),
        }
    }

@app.post("/encaminhar")
async def marcar_encaminhado(request: EncaminharRequest):
    """Marca um laudo como encaminhado ou não"""
    if request.laudo_id not in laudos_db:
        raise HTTPException(status_code=404, detail="Laudo não encontrado")
    
    laudos_db[request.laudo_id]["encaminhado"] = request.encaminhado
    if request.encaminhado:
        laudos_db[request.laudo_id]["data_encaminhamento"] = datetime.now().isoformat()
    else:
        laudos_db[request.laudo_id]["data_encaminhamento"] = None
    
    return {"success": True, "laudo": laudos_db[request.laudo_id]}

@app.delete("/laudos/{laudo_id}")
async def deletar_laudo(laudo_id: str, db: Session = Depends(get_db)):
    """Remove um laudo do sistema"""
    deleted = False
    
    # Tentar deletar da memória
    if laudo_id in laudos_db:
        del laudos_db[laudo_id]
        deleted = True
    
    # Tentar deletar do banco de dados
    if USE_DATABASE:
        try:
            db_id = int(laudo_id)
            laudo_db = db.query(LaudoDB).filter(LaudoDB.id == db_id).first()
            if laudo_db:
                # Deletar feedbacks relacionados primeiro
                db.query(Feedback).filter(Feedback.laudo_id == db_id).delete()
                db.delete(laudo_db)
                db.commit()
                deleted = True
                print(f"[Delete] Laudo #{db_id} deletado do banco")
        except ValueError:
            pass
    
    if not deleted:
        raise HTTPException(status_code=404, detail="Laudo não encontrado")
    
    return {"success": True, "message": "Laudo removido"}

@app.get("/laudos/{laudo_id}")
async def obter_laudo(laudo_id: str, db: Session = Depends(get_db)):
    """Retorna um laudo específico com texto original completo"""
    # Primeiro tenta buscar da memória
    laudo_mem = laudos_db.get(laudo_id)
    
    # Se tiver na memória e tiver db_id, retorna direto
    if laudo_mem and laudo_mem.get("db_id"):
        return laudo_mem
    
    # Se tiver na memória mas sem db_id, tenta encontrar no banco
    if laudo_mem and USE_DATABASE:
        # Buscar no banco pelo nome do arquivo e timestamp aproximado
        laudo_db = db.query(LaudoDB).filter(
            LaudoDB.arquivo == laudo_mem.get("arquivo")
        ).order_by(LaudoDB.created_at.desc()).first()
        
        if laudo_db:
            laudo_mem["db_id"] = laudo_db.id
            laudo_mem["recebeu_feedback"] = laudo_db.recebeu_feedback
            print(f"[Laudo] Vinculado laudo {laudo_id} ao db_id {laudo_db.id}")
            return laudo_mem
    
    # Se não tiver na memória, tenta buscar do banco pelo ID numérico
    if USE_DATABASE:
        try:
            db_id = int(laudo_id)
            laudo_db = db.query(LaudoDB).filter(LaudoDB.id == db_id).first()
            if laudo_db:
                return {
                    "id": str(laudo_db.id),
                    "db_id": laudo_db.id,
                    "arquivo": laudo_db.arquivo,
                    "formato": laudo_db.arquivo_tipo,
                    "timestamp": laudo_db.created_at.isoformat() if laudo_db.created_at else None,
                    "analise": laudo_db.analise,
                    "texto_original": laudo_db.texto_original,
                    "encaminhado": False,
                    "lessons_count": laudo_db.lessons_count,
                    "recebeu_feedback": laudo_db.recebeu_feedback,
                    "editado_manualmente": laudo_db.editado_manualmente,
                    "editado_em": laudo_db.editado_em.isoformat() if laudo_db.editado_em else None,
                    "corrigido_em": laudo_db.corrigido_em.isoformat() if laudo_db.corrigido_em else None,
                    "arquivo_original": laudo_db.arquivo_path
                }
        except ValueError:
            pass
    
    if not laudo_mem:
        raise HTTPException(status_code=404, detail="Laudo não encontrado")
    
    return laudo_mem

@app.get("/arquivo/{laudo_id}")
async def obter_arquivo_original(laudo_id: str, db: Session = Depends(get_db)):
    """Retorna o arquivo original do laudo"""
    arquivo_salvo = None
    arquivo_nome = "arquivo"
    
    # Primeiro tenta buscar da memória
    if laudo_id in laudos_db:
        laudo = laudos_db[laudo_id]
        arquivo_salvo = laudo.get("arquivo_original")
        arquivo_nome = laudo.get("arquivo", "arquivo")
    
    # Se não encontrou na memória, busca no banco pelo ID numérico
    if not arquivo_salvo and USE_DATABASE:
        try:
            db_id = int(laudo_id)
            laudo_db = db.query(LaudoDB).filter(LaudoDB.id == db_id).first()
            if laudo_db:
                arquivo_salvo = laudo_db.arquivo_path
                arquivo_nome = laudo_db.arquivo
        except ValueError:
            pass
    
    if not arquivo_salvo:
        raise HTTPException(status_code=404, detail="Arquivo original não disponível")
    
    arquivo_path = os.path.join(UPLOADS_DIR, arquivo_salvo)
    
    if not os.path.exists(arquivo_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no servidor")
    
    # Determinar media type
    ext = os.path.splitext(arquivo_salvo)[1].lower()
    media_types = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
        ".txt": "text/plain",
    }
    media_type = media_types.get(ext, "application/octet-stream")
    
    # Se for PDF e o formato do laudo for imagem, converter para imagem
    if ext == '.pdf':
        # Verificar se o laudo foi processado como imagem
        is_image_laudo = False
        if laudo_id in laudos_db:
            is_image_laudo = laudos_db[laudo_id].get("formato") == "imagem"
        elif USE_DATABASE:
            try:
                db_id = int(laudo_id)
                laudo_db = db.query(LaudoDB).filter(LaudoDB.id == db_id).first()
                if laudo_db:
                    is_image_laudo = laudo_db.arquivo_tipo == "imagem"
            except ValueError:
                pass
        
        if is_image_laudo:
            # Converter PDF para imagem
            with open(arquivo_path, "rb") as f:
                pdf_bytes = f.read()
            image_bytes = converter_pdf_para_imagem(pdf_bytes)
            if image_bytes:
                return Response(content=image_bytes, media_type="image/jpeg")
    
    return FileResponse(
        arquivo_path, 
        media_type=media_type,
        filename=arquivo_nome
    )

@app.post("/editar-laudo")
async def editar_laudo(request: EditarLaudoRequest, db: Session = Depends(get_db)):
    """Edita manualmente um campo do laudo"""
    # Campos editáveis na análise
    campos_analise = ["gravidade", "area_valvar", "gradiente_medio", "velocidade_maxima", 
                      "prioridade", "indicacao_tavi", "justificativa"]
    
    # Campos editáveis no paciente
    campos_paciente = ["nome", "idade", "sexo", "data_exame"]
    
    # Buscar laudo na memória ou banco
    laudo_mem = laudos_db.get(request.laudo_id)
    laudo_db = None
    
    # Tentar buscar do banco pelo ID numérico
    if USE_DATABASE:
        try:
            db_id = int(request.laudo_id)
            laudo_db = db.query(LaudoDB).filter(LaudoDB.id == db_id).first()
        except ValueError:
            pass
    
    if not laudo_mem and not laudo_db:
        raise HTTPException(status_code=404, detail="Laudo não encontrado")
    
    # Usar laudo do banco se disponível, senão memória
    analise = laudo_db.analise if laudo_db else laudo_mem["analise"]
    
    # Salvar snapshot antes da primeira edição
    if laudo_db and not laudo_db.editado_manualmente:
        laudo_db.analise_antes_edicao = dict(analise) if isinstance(analise, dict) else analise
    
    # Aplicar edição
    if request.campo in campos_analise:
        analise[request.campo] = request.valor
    elif request.campo in campos_paciente:
        if "paciente" not in analise or analise["paciente"] is None:
            analise["paciente"] = {}
        analise["paciente"][request.campo] = request.valor
    else:
        raise HTTPException(status_code=400, detail=f"Campo '{request.campo}' não é editável")
    
    # Atualizar no banco de dados
    if laudo_db:
        laudo_db.analise = analise
        laudo_db.editado_manualmente = True
        laudo_db.editado_em = datetime.utcnow()
        db.commit()
        print(f"[Edição] Laudo #{laudo_db.id} editado no banco: {request.campo} = {request.valor}")
    
    # Atualizar na memória também
    if laudo_mem:
        laudo_mem["analise"] = analise
        laudo_mem["editado_manualmente"] = True
        laudo_mem["editado_em"] = datetime.utcnow().isoformat()
        if "campos_editados" not in laudo_mem:
            laudo_mem["campos_editados"] = []
        if request.campo not in laudo_mem["campos_editados"]:
            laudo_mem["campos_editados"].append(request.campo)
        laudos_db[request.laudo_id] = laudo_mem
    
    # Retornar laudo completo atualizado
    if laudo_db:
        resultado = {
            "id": str(laudo_db.id),
            "db_id": laudo_db.id,
            "arquivo": laudo_db.arquivo,
            "formato": laudo_db.arquivo_tipo,
            "timestamp": laudo_db.created_at.isoformat() if laudo_db.created_at else None,
            "analise": laudo_db.analise,
            "texto_original": laudo_db.texto_original,
            "encaminhado": False,
            "lessons_count": laudo_db.lessons_count,
            "recebeu_feedback": laudo_db.recebeu_feedback,
            "editado_manualmente": laudo_db.editado_manualmente,
            "editado_em": laudo_db.editado_em.isoformat() if laudo_db.editado_em else None,
            "corrigido_em": laudo_db.corrigido_em.isoformat() if laudo_db.corrigido_em else None,
            "arquivo_original": laudo_db.arquivo_path
        }
    else:
        resultado = laudo_mem
    
    return {"success": True, "laudo": resultado}


# ============================================
# SISTEMA DE APRENDIZADO - NOVOS ENDPOINTS
# ============================================

class FeedbackRequest(BaseModel):
    laudo_id: int  # ID do banco de dados (db_id)
    correcao: str  # O que o médico disse que estava errado

class FeedbackResponse(BaseModel):
    success: bool
    lesson: Optional[dict] = None
    nova_analise: Optional[dict] = None
    message: str

@app.post("/feedback/processar", response_model=FeedbackResponse)
async def processar_feedback(request: FeedbackRequest, db: Session = Depends(get_db)):
    """
    Processa feedback do médico e gera lesson learned.
    Usa Claude Sonnet para análise avançada do erro.
    """
    print(f"\n{'='*60}")
    print(f"[Feedback] INICIANDO PROCESSAMENTO DE FEEDBACK")
    print(f"[Feedback] Laudo ID: {request.laudo_id}")
    print(f"[Feedback] Correção: {request.correcao[:100]}...")
    print(f"{'='*60}")
    
    if not USE_API or client is None:
        print("[Feedback] ERRO: USE_API=false ou client=None")
        raise HTTPException(status_code=503, detail="Feedback/Aprendizado desabilitado (USE_API=false)")
    if not USE_DATABASE:
        print("[Feedback] ERRO: USE_DATABASE=false")
        raise HTTPException(status_code=503, detail="Sistema de aprendizado requer PostgreSQL")
    
    # 1. Buscar laudo original
    laudo = db.query(LaudoDB).filter(LaudoDB.id == request.laudo_id).first()
    if not laudo:
        print(f"[Feedback] ERRO: Laudo {request.laudo_id} não encontrado no banco")
        raise HTTPException(status_code=404, detail="Laudo não encontrado")
    
    print(f"[Feedback] Laudo encontrado: {laudo.arquivo}")
    print(f"[Feedback] Texto original disponível: {bool(laudo.texto_original)}")
    
    # 2. Criar registro de feedback
    feedback = Feedback(
        laudo_id=laudo.id,
        correcao_medico=request.correcao,
        analise_original=laudo.analise,
        status="processing"
    )
    db.add(feedback)
    db.commit()
    print(f"[Feedback] Feedback #{feedback.id} criado no banco")
    
    try:
        # 3. Chamar Sonnet para gerar lesson
        print(f"[Feedback] Chamando Claude {MODEL_LEARNING} para gerar lesson...")
        prompt_lesson = f"""Você é um especialista em cardiologia e machine learning médico.

Um médico corrigiu uma análise de laudo de ecocardiograma feita por IA.

LAUDO ORIGINAL:
{laudo.texto_original or '[Imagem analisada]'}

ANÁLISE DA IA:
{json.dumps(laudo.analise, ensure_ascii=False, indent=2)}

CORREÇÃO DO MÉDICO:
{request.correcao}

Baseado nesta correção, gere uma REGRA CLÍNICA GENÉRICA que a IA deve aprender para evitar erros similares no futuro.

A regra deve ser:
1. Genérica (aplicável a outros casos similares)
2. Específica o suficiente para ser útil
3. Baseada em evidências clínicas

Responda APENAS com JSON válido:
{{
    "regra": "A regra clínica que deve ser seguida",
    "quando_aplicar": "Em quais situações aplicar esta regra",
    "exemplo": "Um exemplo prático de aplicação",
    "categoria": "estenose_aortica|gradiente|feve|indicacao_tavi|outro"
}}"""

        print(f"[Feedback] PROMPT COMPLETO ENVIADO (LESSON):\n{'='*60}\n{prompt_lesson}\n{'='*60}")
        
        message = client.messages.create(
            model=MODEL_LEARNING,
            max_tokens=1000,
            temperature=0.3,
            messages=[{"role": "user", "content": prompt_lesson}]
        )
        
        resposta = message.content[0].text.strip()
        print(f"[Feedback] Resposta Claude (lesson): {resposta[:200]}...")
        
        if resposta.startswith("```"):
            resposta = resposta.split("```")[1]
            if resposta.startswith("json"):
                resposta = resposta[4:]
            resposta = resposta.split("```")[0].strip()
        
        lesson_data = json.loads(resposta)
        print(f"[Feedback] Lesson parseada: regra={lesson_data.get('regra', '')[:50]}...")
        
        # 4. Salvar lesson no banco
        lesson = LessonLearned(
            regra=lesson_data.get("regra", ""),
            quando_aplicar=lesson_data.get("quando_aplicar", ""),
            exemplo=lesson_data.get("exemplo", ""),
            categoria=lesson_data.get("categoria", "outro"),
            ativo=True,
            aprovado=True
        )
        db.add(lesson)
        db.commit()
        db.refresh(lesson)
        print(f"[Feedback] ✅ LESSON #{lesson.id} SALVA NO BANCO!")
        print(f"[Feedback] Lesson: {lesson.regra[:100]}...")
        
        # 5. Atualizar feedback com lesson e marcar laudo como corrigido
        feedback.lesson_id = lesson.id
        feedback.status = "completed"
        feedback.processed_at = datetime.utcnow()
        laudo.recebeu_feedback = True
        laudo.corrigido_em = datetime.utcnow()  # Timestamp de quando foi corrigido
        db.commit()
        print(f"[Feedback] Feedback #{feedback.id} atualizado, laudo.recebeu_feedback=True, corrigido_em={laudo.corrigido_em}")
        
        # 6. Reanalisar o laudo com novo conhecimento
        print(f"[Feedback] Iniciando reprocessamento do laudo #{laudo.id}...")
        nova_analise = None
        lessons = get_active_lessons(db)
        lessons_text = format_lessons_for_prompt(lessons)
        print(f"[Feedback] Lessons ativas para reprocessamento: {len(lessons)}")
        
        # Verificar se é texto ou imagem
        is_image = laudo.texto_original == "[Imagem analisada por visão computacional]" or laudo.arquivo_tipo == "imagem"
        
        if is_image and laudo.arquivo_path:
            # Reprocessar imagem
            try:
                arquivo_path = os.path.join(UPLOADS_DIR, laudo.arquivo_path)
                if os.path.exists(arquivo_path):
                    print(f"[Feedback] Reprocessando IMAGEM: {arquivo_path}")
                    with open(arquivo_path, "rb") as f:
                        file_bytes = f.read()
                    
                    # Se for PDF, converter para imagem primeiro
                    ext = os.path.splitext(laudo.arquivo_path)[1].lower()
                    if ext == '.pdf':
                        print(f"[Feedback] Arquivo é PDF, convertendo para imagem...")
                        image_bytes = converter_pdf_para_imagem(file_bytes)
                        if not image_bytes:
                            print(f"[Feedback] ⚠️ Não foi possível converter PDF para imagem")
                            raise Exception("Falha ao converter PDF para imagem")
                        media_type = "image/jpeg"
                    else:
                        image_bytes = file_bytes
                        media_type = get_media_type(laudo.arquivo_path)
                    
                    nova_analise = analisar_imagem_claude(image_bytes, media_type, lessons_text)
                    nova_analise = nova_analise.model_dump()
                    print(f"[Feedback] Nova análise (imagem): gravidade={nova_analise.get('gravidade')}, prioridade={nova_analise.get('prioridade')}")
                    
                    laudo.analise = nova_analise
                    laudo.lessons_count = len(lessons)
                    db.commit()
                    print(f"[Feedback] ✅ LAUDO #{laudo.id} (IMAGEM) ATUALIZADO NO BANCO!")
                else:
                    print(f"[Feedback] ⚠️ Arquivo de imagem não encontrado: {arquivo_path}")
            except Exception as reprocess_error:
                print(f"[Feedback] ❌ ERRO ao reprocessar imagem: {reprocess_error}")
                import traceback
                traceback.print_exc()
        elif laudo.texto_original and not is_image:
            # Reprocessar texto
            try:
                print(f"[Feedback] Reprocessando TEXTO com {len(lessons)} lessons")
                print(f"[Feedback] Lessons text: {lessons_text[:200]}..." if lessons_text else "[Feedback] Nenhuma lesson no prompt")
                
                print(f"[Feedback] Chamando Claude {MODEL_ANALYSIS} para reanalisar...")
                nova_analise = analisar_laudo_claude(laudo.texto_original, lessons_text)
                nova_analise = nova_analise.model_dump()
                print(f"[Feedback] Nova análise recebida: gravidade={nova_analise.get('gravidade')}, prioridade={nova_analise.get('prioridade')}")
                
                laudo.analise = nova_analise
                laudo.lessons_count = len(lessons)
                db.commit()
                print(f"[Feedback] ✅ LAUDO #{laudo.id} ATUALIZADO NO BANCO COM NOVA ANÁLISE!")
            except Exception as reprocess_error:
                print(f"[Feedback] ❌ ERRO ao reprocessar laudo: {reprocess_error}")
                import traceback
                traceback.print_exc()
        else:
            print(f"[Feedback] ⚠️ Reprocessamento ignorado: sem texto_original ou arquivo_path")
        
        print(f"[Feedback] ✅ FEEDBACK PROCESSADO COM SUCESSO!")
        print(f"{'='*60}\n")
        
        return FeedbackResponse(
            success=True,
            lesson={
                "id": lesson.id,
                "regra": lesson.regra,
                "quando_aplicar": lesson.quando_aplicar,
                "exemplo": lesson.exemplo,
                "categoria": lesson.categoria
            },
            nova_analise=nova_analise,
            message="Obrigado! Seu feedback foi processado e o sistema aprendeu uma nova regra."
        )
        
    except Exception as e:
        feedback.status = "failed"
        feedback.erro = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Erro ao processar feedback: {str(e)}")


@app.get("/lessons")
async def listar_lessons(
    ativo: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    """Lista todas as lessons aprendidas"""
    print(f"[Lessons] GET /lessons chamado com ativo={ativo}")
    
    if not USE_DATABASE:
        print("[Lessons] USE_DATABASE=False, retornando lista vazia")
        return {"lessons": [], "total": 0, "message": "Sistema de aprendizado requer PostgreSQL"}
    
    from sqlalchemy.orm import joinedload
    
    query = db.query(LessonLearned).options(
        joinedload(LessonLearned.feedback).joinedload(Feedback.laudo)
    )
    if ativo is not None:
        query = query.filter(LessonLearned.ativo == ativo)
    
    lessons = query.order_by(LessonLearned.created_at.desc()).all()
    print(f"[Lessons] Encontradas {len(lessons)} lessons no banco")
    
    # Buscar dados completos incluindo feedback e laudo relacionados
    lessons_data = []
    for l in lessons:
        # Debug: verificar se feedback está carregado
        print(f"[Lessons] Lesson #{l.id}: feedback={l.feedback}")
        
        lesson_dict = {
            "id": l.id,
            "regra": l.regra,
            "quando_aplicar": l.quando_aplicar,
            "exemplo": l.exemplo,
            "categoria": l.categoria,
            "ativo": l.ativo,
            "aprovado": l.aprovado,
            "vezes_aplicada": l.vezes_aplicada,
            "created_at": l.created_at.isoformat() if l.created_at else None,
            # Dados adicionais para o modal
            "analise_original": None,
            "analise_corrigida": None,
            "feedback_medico": None,
            "paciente": None
        }
        
        # Buscar feedback relacionado - tentar via relação ou query direta
        feedback = l.feedback
        if not feedback:
            # Tentar buscar diretamente
            feedback = db.query(Feedback).filter(Feedback.lesson_id == l.id).first()
            print(f"[Lessons] Lesson #{l.id}: feedback via query direta = {feedback}")
        
        if feedback:
            lesson_dict["feedback_medico"] = feedback.correcao_medico
            lesson_dict["analise_original"] = feedback.analise_original
            
            # Buscar laudo para pegar análise corrigida e dados do paciente
            laudo = feedback.laudo
            if not laudo and feedback.laudo_id:
                laudo = db.query(LaudoDB).filter(LaudoDB.id == feedback.laudo_id).first()
            
            if laudo:
                lesson_dict["analise_corrigida"] = laudo.analise
                # Extrair dados do paciente da análise
                if laudo.analise and isinstance(laudo.analise, dict):
                    lesson_dict["paciente"] = laudo.analise.get("paciente")
        
        lessons_data.append(lesson_dict)
    
    result = {
        "lessons": lessons_data,
        "total": len(lessons)
    }
    
    print(f"[Lessons] Retornando {len(lessons_data)} lessons com dados completos")
    return result


@app.get("/historico")
async def listar_historico(
    limite: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Lista histórico de laudos processados do banco de dados"""
    if not USE_DATABASE:
        # Fallback para memória
        laudos = list(laudos_db.values())
        return {"laudos": laudos[offset:offset+limite], "total": len(laudos)}
    
    total = db.query(LaudoDB).count()
    laudos = db.query(LaudoDB).order_by(LaudoDB.created_at.desc()).offset(offset).limit(limite).all()
    
    return {
        "laudos": [
            {
                "id": l.id,
                "arquivo": l.arquivo,
                "arquivo_tipo": l.arquivo_tipo,
                "analise": l.analise,
                "lessons_count": l.lessons_count,
                "modelo_ia": l.modelo_ia,
                "created_at": l.created_at.isoformat() if l.created_at else None
            }
            for l in laudos
        ],
        "total": total,
        "limite": limite,
        "offset": offset
    }


@app.get("/lessons/{lesson_id}")
async def obter_lesson(lesson_id: int, db: Session = Depends(get_db)):
    """Retorna detalhes de uma lesson específica com dados do feedback associado"""
    if not USE_DATABASE:
        raise HTTPException(status_code=503, detail="Sistema de aprendizado requer PostgreSQL")
    
    lesson = db.query(LessonLearned).filter(LessonLearned.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson não encontrada")
    
    # Buscar feedback associado para obter análise original e corrigida
    # Pegar o mais recente que tenha laudo existente
    feedbacks = db.query(Feedback).filter(Feedback.lesson_id == lesson_id).order_by(Feedback.id.desc()).all()
    
    result = {
        "id": lesson.id,
        "regra": lesson.regra,
        "quando_aplicar": lesson.quando_aplicar,
        "exemplo": lesson.exemplo,
        "categoria": lesson.categoria,
        "ativa": lesson.ativo,
        "created_at": lesson.created_at.isoformat() if lesson.created_at else None,
    }
    
    # Encontrar feedback com laudo existente
    for feedback in feedbacks:
        if feedback.laudo_id:
            laudo = db.query(LaudoDB).filter(LaudoDB.id == feedback.laudo_id).first()
            if laudo:
                result["feedback_medico"] = feedback.correcao_medico
                result["analise_original"] = feedback.analise_original
                result["laudo_id"] = feedback.laudo_id
                if laudo.analise:
                    result["paciente"] = laudo.analise.get("paciente")
                    result["analise_corrigida"] = laudo.analise
                break
        else:
            # Feedback sem laudo, usar apenas analise_original
            if not result.get("analise_original"):
                result["feedback_medico"] = feedback.correcao_medico
                result["analise_original"] = feedback.analise_original
    
    print(f"[Lessons] Detalhes lesson #{lesson_id}: analise_original={result.get('analise_original') is not None}, analise_corrigida={result.get('analise_corrigida') is not None}")
    return result


@app.delete("/lessons/{lesson_id}")
async def deletar_lesson(lesson_id: int, db: Session = Depends(get_db)):
    """Deleta permanentemente uma lesson"""
    if not USE_DATABASE:
        raise HTTPException(status_code=503, detail="Sistema de aprendizado requer PostgreSQL")
    
    lesson = db.query(LessonLearned).filter(LessonLearned.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson não encontrada")
    
    # Deletar feedbacks associados primeiro
    db.query(Feedback).filter(Feedback.lesson_id == lesson_id).delete()
    
    # Deletar a lesson
    db.delete(lesson)
    db.commit()
    print(f"[Lessons] Lesson #{lesson_id} DELETADA permanentemente")
    
    return {"success": True, "message": "Lesson deletada permanentemente"}


@app.get("/estatisticas/aprendizado")
async def estatisticas_aprendizado(db: Session = Depends(get_db)):
    """Estatísticas do sistema de aprendizado"""
    if not USE_DATABASE:
        return {
            "database": False,
            "total_laudos": len(laudos_db),
            "total_lessons": 0,
            "total_feedbacks": 0
        }
    
    return {
        "database": True,
        "total_laudos": db.query(LaudoDB).count(),
        "total_lessons": db.query(LessonLearned).filter(LessonLearned.ativo == True).count(),
        "total_lessons_all": db.query(LessonLearned).count(),
        "total_feedbacks": db.query(Feedback).count(),
        "feedbacks_completed": db.query(Feedback).filter(Feedback.status == "completed").count(),
        "feedbacks_failed": db.query(Feedback).filter(Feedback.status == "failed").count()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
