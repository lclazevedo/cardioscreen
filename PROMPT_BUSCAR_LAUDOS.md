# 🔍 Guia para Buscar Laudos de Ecocardiograma Online

## Objetivo
Encontrar exemplos reais de laudos de ecocardiograma em PDF para testar o CardioScreen, especialmente laudos com estenose aórtica em diferentes graus de severidade.

## 🎯 Prompt para Claude/Gemini/ChatGPT

```
Preciso encontrar exemplos de laudos de ecocardiograma transtorácico em PDF, 
preferencialmente em português brasileiro. Estou desenvolvendo um sistema de 
triagem para estenose aórtica (TAVI) e preciso de laudos reais para testes.

Critérios:
- Laudos com estenose aórtica (leve, moderada, importante, grave)
- Formato PDF ou texto copiável
- Que contenham: área valvar aórtica, gradiente médio, velocidade máxima
- De preferência anônimos ou casos clínicos publicados
- Fontes acadêmicas, repositórios, ou sites médicos confiáveis

Sites/fontes sugeridas:
1. Scribd (documentos médicos)
2. ResearchGate (artigos científicos)
3. Repositórios universitários (USP, UNIFESP, UFRJ)
4. SciELO (artigos brasileiros)
5. Google Scholar
6. Portais de radiologia/cardiologia

Buscar por termos:
- "laudo ecocardiograma estenose aórtica"
- "relatório ecocardiograma PDF"
- "caso clínico estenose valvar"
- "exemplo laudo eco aortic stenosis"

Me forneça links diretos para PDFs ou documentos acessíveis.
```

## 📋 Estratégia de Busca

### Google Search
```
site:scribd.com laudo ecocardiograma estenose aórtica filetype:pdf
site:.edu.br ecocardiograma estenose aórtica PDF
"laudo de ecocardiograma" "estenose aórtica" "área valvar"
exemplo "relatório de ecocardiograma" PDF
```

### Google Scholar
```
"ecocardiograma" "estenose aórtica" "caso clínico"
"laudo ecocardiográfico" "válvula aórtica"
```

### Scribd (direto no site)
```
laudo ecocardiograma
ecocardiograma estenose
relatório eco cardíaco
```

## 🌐 Sites Encontrados (Anteriormente)

### 1. Scribd
- **Laudo com Estenose Importante:**  
  https://www.scribd.com/document/663941190/Laudo-Ecocardiograma-2807
  
- **Modelo de Laudo Eco:**  
  https://www.scribd.com/document/556162593/Modelo-de-Laudo-Eco-Celia-Camara

- **Busca geral:**  
  https://www.scribd.com/search?query=laudo+ecocardiograma

### 2. Academia.edu
- Buscar: "ecocardiograma estenose"
- Muitos artigos de cardiologia brasileiros

### 3. SciELO
- https://www.scielo.br/
- Buscar: "ecocardiograma" + "estenose aórtica"
- Artigos científicos com casos clínicos

### 4. Repositórios Universitários

**USP:**
- https://www.teses.usp.br/
- Dissertações de cardiologia com laudos em anexos

**UNIFESP:**
- Repositório institucional
- Estudos sobre valvopatias

## 🔧 Como Usar os Laudos Encontrados

### 1. Download
```bash
# Se for PDF direto
wget "URL_DO_PDF" -O laudo_teste_01.pdf

# Se for Scribd (pode precisar criar conta gratuita)
# - Visualize online
# - Print to PDF
```

### 2. Conversão TXT → PDF
```python
# Se encontrar em formato texto
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

def txt_para_pdf(txt_file, pdf_file):
    c = canvas.Canvas(pdf_file, pagesize=letter)
    with open(txt_file, 'r', encoding='utf-8') as f:
        text = f.read()
    
    y = 750
    for line in text.split('\n'):
        if y < 50:  # Nova página
            c.showPage()
            y = 750
        c.drawString(50, y, line[:100])  # Max 100 chars/linha
        y -= 15
    
    c.save()
    print(f'Criado: {pdf_file}')

# Uso
txt_para_pdf('laudo.txt', 'laudo.pdf')
```

### 3. Organização
```bash
tests/laudos_exemplo/
├── graves/
│   ├── laudo_grave_01.pdf
│   ├── laudo_grave_02.pdf
│   └── laudo_grave_03.pdf
├── moderados/
│   ├── laudo_mod_01.pdf
│   └── laudo_mod_02.pdf
├── leves/
│   └── laudo_leve_01.pdf
└── normais/
    └── laudo_normal_01.pdf
```

## 🧪 Testar Laudos no CardioScreen

```bash
# Backend rodando em localhost:8000
# Frontend em localhost:3000

# Método 1: Via Frontend
1. Abra http://localhost:3000
2. Click "Upload de Laudos"
3. Selecione os PDFs
4. Aguarde análise

# Método 2: Via API (curl)
curl -X POST http://localhost:8000/analisar-laudo \
  -F "file=@laudo_teste.pdf"

# Método 3: Python script
import requests

with open('laudo_teste.pdf', 'rb') as f:
    response = requests.post(
        'http://localhost:8000/analisar-laudo',
        files={'file': f}
    )
    print(response.json())
```

## ⚠️ Considerações Éticas

### Atenção LGPD/Privacidade

- ✅ **Usar:** Laudos anônimos de casos clínicos publicados
- ✅ **Usar:** Laudos de artigos científicos
- ✅ **Usar:** Laudos sintéticos/exemplo de sistemas de software
- ❌ **Evitar:** Laudos reais de pacientes identificáveis
- ❌ **Evitar:** Dados protegidos por sigilo médico

### Recomendações

1. Remova dados pessoais antes de usar:
   - Nome do paciente
   - CPF, RG, data de nascimento
   - Endereço
   - Número de prontuário
   - Nome do médico (opcional)

2. Use apenas para desenvolvimento/testes internos

3. Não compartilhe laudos reais publicamente

## 📊 Validação dos Laudos

### Checklist de Qualidade

Um bom laudo para teste deve ter:
- [x] Seção de identificação valvar (tricúspide/bicúspide)
- [x] Área valvar aórtica em cm²
- [x] Gradiente médio em mmHg
- [x] Velocidade máxima em m/s (opcional)
- [x] Descrição do grau de estenose
- [x] Estado de calcificação
- [x] Dados do VE (fração de ejeção)

### Exemplos de Termos a Buscar no Laudo

```
✅ BONS INDICADORES:
- "estenose aórtica importante"
- "área valvar: 0.8 cm²"
- "gradiente médio: 45 mmHg"
- "velocidade máxima: 4.2 m/s"
- "calcificação importante dos folhetos"
- "indicação de troca valvar"

⚠️ AMBÍGUOS (podem precisar de contexto):
- "válvula esclerótica"
- "espessamento dos folhetos"
- "alteração valvar"

❌ INSUFICIENTES:
- Apenas "sopro aórtico"
- Sem medidas quantitativas
- Muito genérico
```

## 🚀 Próximos Passos

1. **Buscar 20-30 laudos variados:**
   - 5-10 estenose grave
   - 5-10 estenose moderada
   - 5 estenose leve
   - 5 normais

2. **Validar manualmente:**
   - Classificar cada laudo (alta/média/baixa prioridade)
   - Criar "ground truth" para comparar com IA

3. **Métricas de Performance:**
   - Acurácia da classificação
   - Falsos positivos/negativos
   - Confiança média do modelo

4. **Iterar no prompt:**
   - Ajustar se muitos erros
   - Adicionar exemplos no contexto
   - Fine-tuning (futuro)

---

**Boa sorte na busca! 🔍**
