use super::models::{ProcGenerateRequest, ProcGenerateResponse, ProcItem, ProcStep};
use sqlx::{PgPool, Row};

pub fn detect_family(desc: &str) -> (&'static str, &'static str) {
    let d = desc.to_uppercase();
    if d.contains("SPRAY")
        || d.contains("FINALIZADOR")
        || d.contains("LEAVE IN")
        || d.contains("LEAVE-IN")
        || d.contains("FLUIDO")
        || d.contains("PERFUME")
    {
        ("SPRAY_FINALIZADOR", "Spray e Finalizador Fluido")
    } else if d.contains("SHAMPOO") || d.contains("SH ") || d.contains("SH.") {
        ("SHAMPOO", "Shampoo Capilar")
    } else if d.contains("MASCARA")
        || d.contains("MÁSCARA")
        || d.contains("CREME")
        || d.contains("MASK")
        || d.contains("BANHO DE")
    {
        ("MASCARA_TRATAMENTO", "Máscara e Creme de Tratamento")
    } else if d.contains("CONDICIONADOR")
        || d.contains("COND ")
        || d.contains("COND.")
        || d.contains("BALSAMO")
        || d.contains("BÁLSAMO")
    {
        ("CONDICIONADOR", "Condicionador e Bálsamo")
    } else if d.contains("OLEO")
        || d.contains("ÓLEO")
        || d.contains("OIL")
        || d.contains("SERUM")
        || d.contains("SÉRUM")
        || d.contains("REPARADOR")
    {
        ("OLEO_SERUM", "Óleo Capilar e Sérum")
    } else if d.contains("TONICO")
        || d.contains("TÔNICO")
        || d.contains("LOÇÃO")
        || d.contains("LOCAO")
    {
        ("TONICO_LOCAO", "Tônico e Loção Capilar")
    } else if d.contains("AOX")
        || d.contains("OXIDANTE")
        || d.contains("EMULSAO OXIDANTE")
        || d.contains("EMULSÃO OXIDANTE")
        || d.contains("PEROXIDO")
        || d.contains("PERÓXIDO")
    {
        ("OXIDANTE_AOX", "Emulsão Oxidante (AOX)")
    } else if d.contains("BOTTOX")
        || d.contains("BOTOX")
        || d.contains("AMONIA")
        || d.contains("AMÔNIA")
        || d.contains("ALISAMENTO")
        || d.contains("GUANIDINA")
        || d.contains("TIOGL")
        || d.contains("PROGRESSIVA")
        || d.contains("REDUTOR")
        || d.contains("SELAGEM")
        || d.contains("GLOSS")
    {
        ("TRANSFORMACAO_ALISAMENTO", "Transformação e Alisamento")
    } else if d.contains("AMPOLA") || d.contains("DOSE") {
        ("AMPOLA_DOSE", "Ampola e Dose Concentrada")
    } else if d.contains("POMADA")
        || d.contains("GEL")
        || d.contains("GELEIA")
        || d.contains("GELÉIA")
        || d.contains("PASTA")
        || d.contains("CERINHA")
    {
        ("GEL_POMADA", "Pomada, Cera e Gel Capilar")
    } else if d.contains("PO ") || d.contains("PÓ ") || d.contains("DESCOLORANTE") {
        ("PO_DESCOLORANTE", "Pó Descolorante")
    } else if d.contains("ATIVADOR") {
        ("ATIVADOR_FINALIZADOR", "Ativador de Cachos")
    } else if d.contains("NEUTRALIZANTE") || d.contains("NEUTRAL") {
        ("NEUTRALIZANTE", "Neutralizante Capilar")
    } else {
        ("OUTROS", "Outros Cosméticos")
    }
}

pub async fn generate_proc_for_product(
    pool: &PgPool,
    req: &ProcGenerateRequest,
) -> Result<ProcGenerateResponse, String> {
    let (detected_key, detected_label) = if let Some(cat) = &req.categoria_familia {
        if !cat.trim().is_empty() && cat != "OUTROS" {
            match cat.as_str() {
                "SPRAY_FINALIZADOR" => ("SPRAY_FINALIZADOR", "Spray e Finalizador Fluido"),
                "SHAMPOO" => ("SHAMPOO", "Shampoo Capilar"),
                "MASCARA_TRATAMENTO" => ("MASCARA_TRATAMENTO", "Máscara e Creme de Tratamento"),
                "CONDICIONADOR" => ("CONDICIONADOR", "Condicionador e Bálsamo"),
                "OLEO_SERUM" => ("OLEO_SERUM", "Óleo Capilar e Sérum"),
                "TONICO_LOCAO" => ("TONICO_LOCAO", "Tônico e Loção Capilar"),
                "OXIDANTE_AOX" => ("OXIDANTE_AOX", "Emulsão Oxidante (AOX)"),
                "TRANSFORMACAO_ALISAMENTO" => ("TRANSFORMACAO_ALISAMENTO", "Transformação e Alisamento"),
                "AMPOLA_DOSE" => ("AMPOLA_DOSE", "Ampola e Dose Concentrada"),
                "GEL_POMADA" => ("GEL_POMADA", "Pomada, Cera e Gel Capilar"),
                "PO_DESCOLORANTE" => ("PO_DESCOLORANTE", "Pó Descolorante"),
                "ATIVADOR_FINALIZADOR" => ("ATIVADOR_FINALIZADOR", "Ativador de Cachos"),
                "NEUTRALIZANTE" => ("NEUTRALIZANTE", "Neutralizante Capilar"),
                _ => detect_family(&req.descricao),
            }
        } else {
            detect_family(&req.descricao)
        }
    } else {
        detect_family(&req.descricao)
    };

    // Buscar no banco produtos similares da mesma família que possuem PROC ativo
    let rows = sqlx::query(
        r#"
        SELECT id, codigo_produto, descricao, proc, status, observacoes, categoria_familia, processo_instrucoes,
               to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at,
               to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
        FROM procs_produtos
        WHERE categoria_familia = $1 AND status = 'ATIVO' AND proc IS NOT NULL AND proc != ''
        ORDER BY updated_at DESC
        LIMIT 6
        "#
    )
    .bind(detected_key)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Erro ao buscar similares da família {}: {}", detected_key, e))?;

    let similares: Vec<ProcItem> = rows
        .into_iter()
        .map(|r| ProcItem {
            id: r.get("id"),
            codigo_produto: r.get("codigo_produto"),
            descricao: r.get("descricao"),
            proc: r.get("proc"),
            status: r.get("status"),
            observacoes: r.get("observacoes"),
            categoria_familia: r.get("categoria_familia"),
            processo_instrucoes: r.get("processo_instrucoes"),
            created_at: r.get("created_at"),
            updated_at: r.get("updated_at"),
        })
        .collect();

    let sugerido_proc_base = similares.first().and_then(|s| s.proc.clone());

    // Gerar parâmetros e etapas por família cosmética
    let (
        ph_faixa,
        visc_faixa,
        dens_faixa,
        aspecto,
        cor,
        odor,
        equipamentos,
        epis,
        etapas,
    ) = match detected_key {
        "SPRAY_FINALIZADOR" | "TONICO_LOCAO" => (
            "4.00 – 6.00".to_string(),
            "Líquido Fluido (10 – 100 cP)".to_string(),
            "0.980 – 1.020 g/mL".to_string(),
            "Líquido límpido a translúcido, homogêneo e sem precipitados".to_string(),
            "Incolor a levemente amarelado característico".to_string(),
            "Fragrância floral/frutal característica e agradável".to_string(),
            vec![
                "Tanque em inox com agitação hélice naval".to_string(),
                "Balança digital calibrada".to_string(),
                "Filtro de linha para envase líquido".to_string(),
                "Envasadora líquida com bico dosador e recravadora de válvula spray".to_string(),
            ],
            vec![
                "Óculos de proteção ampla visão".to_string(),
                "Luvas nitrílicas".to_string(),
                "Máscara contra vapores orgânicos/poeiras".to_string(),
                "Touca e jaleco de produção".to_string(),
            ],
            vec![
                ProcStep {
                    ordem: 1,
                    titulo: "Pesagem e Sanitização".to_string(),
                    descricao: "Sanitizar o reator e tubulações com álcool 70%. Pesar criteriosamente todas as matérias-primas na balança calibrada conforme ordem de fabricação.".to_string(),
                    temperatura: Some("Ambiente (20-25°C)".to_string()),
                    agitacao: Some("Parada".to_string()),
                    tempo: Some("15 min".to_string()),
                },
                ProcStep {
                    ordem: 2,
                    titulo: "Fase Aquosa Principal".to_string(),
                    descricao: "Adicionar a água deionizada no tanque de mistura. Iniciar agitação moderada sem incorporar ar. Adicionar conservantes e agentes quelantes (EDTA/Dissódico).".to_string(),
                    temperatura: Some("Ambiente".to_string()),
                    agitacao: Some("Moderada (300-400 RPM)".to_string()),
                    tempo: Some("10-15 min".to_string()),
                },
                ProcStep {
                    ordem: 3,
                    titulo: "Pré-solubilização de Fragrância e Ativos Lipofílicos".to_string(),
                    descricao: "Em recipiente auxiliar, pré-misturar a fragrância e ativos lipofílicos com o tensoativo solubilizante (Polissorbato / PEG-40) até completa homogeneidade límpida. Verter lentamente sobre o reator principal sob agitação constante.".to_string(),
                    temperatura: Some("Ambiente".to_string()),
                    agitacao: Some("Moderada".to_string()),
                    tempo: Some("15 min".to_string()),
                },
                ProcStep {
                    ordem: 4,
                    titulo: "Ajuste de pH e Controle Físico-Químico".to_string(),
                    descricao: "Coletar amostra para teste laboratorial. Ajustar o pH com solução de ácido cítrico a 50% para a faixa de 4.0 a 5.5. Homogeneizar por 10 minutos após o ajuste.".to_string(),
                    temperatura: Some("Ambiente".to_string()),
                    agitacao: Some("Lenta a Moderada".to_string()),
                    tempo: Some("10 min".to_string()),
                },
                ProcStep {
                    ordem: 5,
                    titulo: "Filtração e Liberação para Envase".to_string(),
                    descricao: "Passar o produto por elemento filtrante de malha fina (100 mesh) para reter quaisquer partículas. Conferir peso líquido do frasco e estanqueidade da válvula spray.".to_string(),
                    temperatura: Some("Ambiente".to_string()),
                    agitacao: Some("Parada".to_string()),
                    tempo: Some("Conforme lote".to_string()),
                },
            ],
        ),
        "SHAMPOO" => (
            "5.00 – 6.50".to_string(),
            "5.000 – 15.000 cP (Spindle 4 @ 20 RPM)".to_string(),
            "1.010 – 1.045 g/mL".to_string(),
            "Líquido viscoso, translúcido ou perolado homogêneo".to_string(),
            "Característica do produto".to_string(),
            "Fragrância característica".to_string(),
            vec![
                "Reator encamisado em inox 316L com agitador tipo âncora e pás contra-rotativas".to_string(),
                "Balança calibrada de precisão".to_string(),
                "Bomba helicoidal para transferência de fluidos viscosos".to_string(),
                "Envasadora volumétrica automática/semiautomática".to_string(),
            ],
            vec![
                "Óculos de segurança".to_string(),
                "Luvas de nitrila cano longo".to_string(),
                "Avental de PVC impermeável".to_string(),
                "Botas de segurança e touca descartável".to_string(),
            ],
            vec![
                ProcStep {
                    ordem: 1,
                    titulo: "Carga de Água e Espessamento Inicial".to_string(),
                    descricao: "Adicionar água no reator. Iniciar agitação lenta. Dispersar polímeros condicionantes/espessantes (Polyquaternium, Goma Guar) até completa hidratação sem formação de grumos.".to_string(),
                    temperatura: Some("Ambiente ou 40°C se aquecimento".to_string()),
                    agitacao: Some("Lenta a Moderada (200-300 RPM)".to_string()),
                    tempo: Some("25-30 min".to_string()),
                },
                ProcStep {
                    ordem: 2,
                    titulo: "Incorporação dos Tensoativos Primários e Secundários".to_string(),
                    descricao: "Adicionar Lauril Éter Sulfato de Sódio, Cocoamidopropil Betaína e Dietanolamida de Ácido Graxo de Coco (Amida 90/80). Manter agitação suave para evitar a formação de espuma.".to_string(),
                    temperatura: Some("Ambiente (25-35°C)".to_string()),
                    agitacao: Some("Lenta contínua (150-200 RPM)".to_string()),
                    tempo: Some("20 min".to_string()),
                },
                ProcStep {
                    ordem: 3,
                    titulo: "Adição de Perolizantes, Ativos e Fragrância".to_string(),
                    descricao: "Adicionar base perolizante (se aplicável), extratos botânicos, óleos solúveis, conservantes e essência. Homogeneizar por 15 minutos até perfeita dispersão.".to_string(),
                    temperatura: Some("Abaixo de 40°C".to_string()),
                    agitacao: Some("Lenta".to_string()),
                    tempo: Some("15 min".to_string()),
                },
                ProcStep {
                    ordem: 4,
                    titulo: "Ajuste de pH e Acerto de Viscosidade (Salting-out)".to_string(),
                    descricao: "Ajustar o pH com solução de ácido cítrico para 5.0 - 6.0. Em seguida, dosar solução saturada de Cloreto de Sódio (NaCl) aos poucos sob agitação constante até atingir a viscosidade alvo especificada.".to_string(),
                    temperatura: Some("25°C".to_string()),
                    agitacao: Some("Lenta constante".to_string()),
                    tempo: Some("20 min".to_string()),
                },
                ProcStep {
                    ordem: 5,
                    titulo: "Repouso para Desaeração e Envase".to_string(),
                    descricao: "Deixar a massa em repouso por no mínimo 2 a 4 horas para eliminação de microbolhas de ar incorporadas. Liberar laudo físico-químico e proceder ao envase.".to_string(),
                    temperatura: Some("Ambiente".to_string()),
                    agitacao: Some("Desligada".to_string()),
                    tempo: Some("2 a 4 horas".to_string()),
                },
            ],
        ),
        "MASCARA_TRATAMENTO" | "CONDICIONADOR" => (
            "3.50 – 4.50".to_string(),
            "25.000 – 90.000 cP (Spindle 6/7 @ 20 RPM)".to_string(),
            "0.960 – 1.010 g/mL".to_string(),
            "Creme emulsão consistente, brilhante e homogêneo".to_string(),
            "Branco a levemente perolizado / pigmentado".to_string(),
            "Fragrância cosmética marcante e agradável".to_string(),
            vec![
                "Reator encamisado com aquecimento a vapor e resfriamento por água".to_string(),
                "Homogeneizador de alto cisalhamento (Rotor-Stator / Turbo)".to_string(),
                "Tanque auxiliar para fusão da fase oleosa (75-80°C)".to_string(),
                "Bomba de lóbulos / cavidade progressiva para produtos altamente viscosos".to_string(),
            ],
            vec![
                "Luvas térmicas de proteção contra calor".to_string(),
                "Óculos de segurança com proteção lateral".to_string(),
                "Avental térmico e mangote de segurança".to_string(),
                "Botas antiderrapantes e máscara de proteção respiratória".to_string(),
            ],
            vec![
                ProcStep {
                    ordem: 1,
                    titulo: "Preparo da Fase Aquosa (Fase A)".to_string(),
                    descricao: "Carregar a água deionizada no reator principal. Adicionar agentes quelantes e umectantes (Glicerina/Propilenoglicol). Iniciar aquecimento até atingir 75°C a 80°C sob agitação.".to_string(),
                    temperatura: Some("75°C – 80°C".to_string()),
                    agitacao: Some("Moderada (300 RPM)".to_string()),
                    tempo: Some("30 min".to_string()),
                },
                ProcStep {
                    ordem: 2,
                    titulo: "Fusão da Fase Oleosa (Fase B)".to_string(),
                    descricao: "No tanque auxiliar, fundir álcool cetoestearílico, cloreto de cetrimônio, behentrimônio, manteigas vegetais e agentes emolientes até completa fusão límpida a 75°C - 80°C.".to_string(),
                    temperatura: Some("75°C – 80°C".to_string()),
                    agitacao: Some("Lenta".to_string()),
                    tempo: Some("25 min".to_string()),
                },
                ProcStep {
                    ordem: 3,
                    titulo: "Emulsificação a Quente (Fase B sobre Fase A)".to_string(),
                    descricao: "Com ambas as fases a 75-80°C, verter a Fase Oleosa lentamente sobre a Fase Aquosa com o rotor/homogeneizador ligado em alta velocidade por 10 a 15 minutos para formação de emulsão fina estável.".to_string(),
                    temperatura: Some("75°C – 80°C".to_string()),
                    agitacao: Some("Alta Cizalha (Turbo 2000-3000 RPM)".to_string()),
                    tempo: Some("15 min".to_string()),
                },
                ProcStep {
                    ordem: 4,
                    titulo: "Resfriamento Controlado e Adição de Termossensíveis".to_string(),
                    descricao: "Desligar turbo. Ligar água de resfriamento na camisa e manter agitação âncora lenta. Ao atingir temperatura inferior a 40°C, adicionar silicones, aminoácidos, proteínas hidrolisadas, conservantes e essência.".to_string(),
                    temperatura: Some("Resfriando até < 40°C".to_string()),
                    agitacao: Some("Âncora Lenta (80-120 RPM)".to_string()),
                    tempo: Some("40-60 min".to_string()),
                },
                ProcStep {
                    ordem: 5,
                    titulo: "Acerto Final de pH, Homogeneização e Envase".to_string(),
                    descricao: "Aferir pH e viscosidade no laboratório. Ajustar pH com solução de ácido cítrico/lático para 3.5 a 4.5. Homogeneizar por mais 15 minutos. Transferir para a linha de envase.".to_string(),
                    temperatura: Some("25°C – 30°C".to_string()),
                    agitacao: Some("Lenta".to_string()),
                    tempo: Some("15 min".to_string()),
                },
            ],
        ),
        "OLEO_SERUM" => (
            "Não aplicável (Fase Anidra)".to_string(),
            "50 – 500 cP (Fluido oleoso / sérum sedoso)".to_string(),
            "0.920 – 0.965 g/mL".to_string(),
            "Óleo/Sérum límpido, brilhante, 100% transparente e sem turbidez".to_string(),
            "Transparente a levemente dourado característico".to_string(),
            "Fragrância nobre e sofisticada característica".to_string(),
            vec![
                "Tanque em aço inox com agitação hélice limpa e seca (isento de umidade)".to_string(),
                "Balança calibrada de precisão".to_string(),
                "Filtro absoluto de linha para óleos e silicones".to_string(),
                "Envasadora conta-gotas / pump sérum".to_string(),
            ],
            vec![
                "Luvas de nitrila".to_string(),
                "Óculos de proteção".to_string(),
                "Calçado fechado antiderrapante".to_string(),
            ],
            vec![
                ProcStep {
                    ordem: 1,
                    titulo: "Conferência de Umidade e Carga de Silicones".to_string(),
                    descricao: "Assegurar que o reator e mangueiras estejam rigorosamente secos. Adicionar os veículos de ciclometicona e dimeticona sob agitação moderada a frio.".to_string(),
                    temperatura: Some("Ambiente (20-25°C)".to_string()),
                    agitacao: Some("Moderada (300 RPM)".to_string()),
                    tempo: Some("15 min".to_string()),
                },
                ProcStep {
                    ordem: 2,
                    titulo: "Incorporação dos Óleos Nobres e Ativos".to_string(),
                    descricao: "Adicionar Óleo de Argan, Macadâmia, Ojon, Pracaxi ou outros óleos vegetais nobres e antioxidantes (Vitamina E). Manter agitação constante até dissolução homogênea e total limpidez.".to_string(),
                    temperatura: Some("Ambiente".to_string()),
                    agitacao: Some("Moderada".to_string()),
                    tempo: Some("20 min".to_string()),
                },
                ProcStep {
                    ordem: 3,
                    titulo: "Aromatização e Filtração Final".to_string(),
                    descricao: "Adicionar a essência lipofílica. Misturar por 15 minutos. Passar por filtro cartucho de 10 micras para garantir máxima limpidez e brilho cristalino antes do envase.".to_string(),
                    temperatura: Some("Ambiente".to_string()),
                    agitacao: Some("Moderada".to_string()),
                    tempo: Some("15 min".to_string()),
                },
            ],
        ),
        "OXIDANTE_AOX" => (
            "2.00 – 3.20 (Controle Rigoroso de Estabilidade)".to_string(),
            "6.000 – 20.000 cP".to_string(),
            "1.010 – 1.050 g/mL".to_string(),
            "Emulsão cremosa branca homogênea sem bolhas de gás".to_string(),
            "Branco uniforme".to_string(),
            "Inodoro ou suave característico".to_string(),
            vec![
                "Reator em inox 316L ou polipropileno virgem (passivado e isento de metais)".to_string(),
                "Tanque de fusão de base cremosa".to_string(),
                "Agitador com velocidade variável".to_string(),
                "Envasadora com bico dosador com válvula de alívio e tampa valvulada".to_string(),
            ],
            vec![
                "Óculos de segurança com vedação total contra respingos".to_string(),
                "Luvas de PVC / borracha nitrílica cano longo".to_string(),
                "Avental de PVC impermeável e protetor facial".to_string(),
                "Botas de borracha de segurança".to_string(),
            ],
            vec![
                ProcStep {
                    ordem: 1,
                    titulo: "Preparo da Emulsão Base e Estabilização Ácida".to_string(),
                    descricao: "Preparar a emulsão base de álcool cetoestearílico e óleo mineral com água purificada. Adicionar estabilizantes de peróxido (ácido fosfórico / pirofosfato de sódio / fenacetina).".to_string(),
                    temperatura: Some("75°C descendo para 30°C".to_string()),
                    agitacao: Some("Moderada".to_string()),
                    tempo: Some("45 min".to_string()),
                },
                ProcStep {
                    ordem: 2,
                    titulo: "Incorporação do Peróxido de Hidrogênio a Frio".to_string(),
                    descricao: "Com a base totalmente fria (< 30°C), adicionar lentamente a solução concentrada de Peróxido de Hidrogênio (H2O2 50% ou 200V) calculada para a volumagem desejada sob agitação suave.".to_string(),
                    temperatura: Some("< 30°C obrigatório".to_string()),
                    agitacao: Some("Lenta para evitar decomposição".to_string()),
                    tempo: Some("25 min".to_string()),
                },
                ProcStep {
                    ordem: 3,
                    titulo: "Titulação de Volumagem e Liberação".to_string(),
                    descricao: "Realizar titulação permanganométrica para verificação da concentração exata de oxigênio ativo (Volumagem 10V, 20V, 30V ou 40V). Envasar em frascos com tampas de alívio de pressão.".to_string(),
                    temperatura: Some("Ambiente".to_string()),
                    agitacao: Some("Parada".to_string()),
                    tempo: Some("15 min".to_string()),
                },
            ],
        ),
        _ => (
            "4.50 – 6.50".to_string(),
            "Conforme padrão técnico da formulação".to_string(),
            "0.980 – 1.030 g/mL".to_string(),
            "Produto cosmético homogêneo conforme especificação".to_string(),
            "Característica".to_string(),
            "Característico".to_string(),
            vec![
                "Tanque misturador em aço inoxidável 304/316".to_string(),
                "Balança calibrada".to_string(),
                "Equipamento de envase e rotulagem".to_string(),
            ],
            vec![
                "EPIs padrão de fabricação cosmética (luvas, óculos, touca, jaleco)".to_string(),
            ],
            vec![
                ProcStep {
                    ordem: 1,
                    titulo: "Pesagem e Separação de Insumos".to_string(),
                    descricao: "Conferir lotes de matérias-primas e realizar pesagem na balança calibrada de acordo com a ordem de fabricação.".to_string(),
                    temperatura: Some("Ambiente".to_string()),
                    agitacao: Some("Parada".to_string()),
                    tempo: Some("15 min".to_string()),
                },
                ProcStep {
                    ordem: 2,
                    titulo: "Mistura e Homogeneização".to_string(),
                    descricao: "Carregar insumos no reator na ordem de solubilização. Homogeneizar até perfeita dispersão de todos os componentes.".to_string(),
                    temperatura: Some("Conforme fórmula".to_string()),
                    agitacao: Some("Moderada".to_string()),
                    tempo: Some("30 min".to_string()),
                },
                ProcStep {
                    ordem: 3,
                    titulo: "Ajuste de Parâmetros e Liberação".to_string(),
                    descricao: "Realizar medições de pH, viscosidade e densidade no laboratório de controle de qualidade. Liberar para envase após aprovação.".to_string(),
                    temperatura: Some("25°C".to_string()),
                    agitacao: Some("Lenta".to_string()),
                    tempo: Some("15 min".to_string()),
                },
            ],
        ),
    };

    // Montar texto corrido formatado das instruções de processo
    let mut formatado = String::new();
    formatado.push_str(&format!(
        "=== FICHA DE PROCESSO OPERACIONAL PADRÃO (PROC) ===\nPRODUTO: {}\nCATEGORIA: {}\n\n",
        req.descricao.to_uppercase(),
        detected_label.to_uppercase()
    ));
    formatado.push_str("--- ESPECIFICAÇÕES DE CONTROLE DE QUALIDADE ---\n");
    formatado.push_str(&format!("• pH (25°C): {}\n", ph_faixa));
    formatado.push_str(&format!("• Viscosidade (25°C): {}\n", visc_faixa));
    formatado.push_str(&format!("• Densidade (25°C): {}\n", dens_faixa));
    formatado.push_str(&format!("• Aspecto: {}\n", aspecto));
    formatado.push_str(&format!("• Cor: {}\n", cor));
    formatado.push_str(&format!("• Odor: {}\n\n", odor));

    formatado.push_str("--- EQUIPAMENTOS RECOMENDADOS ---\n");
    for eq in &equipamentos {
        formatado.push_str(&format!("• {}\n", eq));
    }
    formatado.push_str("\n--- EPIs OBRIGATÓRIOS ---\n");
    for ep in &epis {
        formatado.push_str(&format!("• {}\n", ep));
    }

    formatado.push_str("\n--- ETAPAS DE FABRICAÇÃO PASSO A PASSO ---\n");
    for st in &etapas {
        formatado.push_str(&format!(
            "\n[ETAPA {}] - {}\nDescrição: {}\nTemperatura: {}\nAgitação: {}\nTempo Estimado: {}\n",
            st.ordem,
            st.titulo,
            st.descricao,
            st.temperatura.as_deref().unwrap_or("Ambiente"),
            st.agitacao.as_deref().unwrap_or("Conforme processo"),
            st.tempo.as_deref().unwrap_or("—")
        ));
    }

    Ok(ProcGenerateResponse {
        descricao: req.descricao.clone(),
        codigo_produto: req.codigo_produto.clone(),
        categoria_familia: detected_key.to_string(),
        categoria_label: detected_label.to_string(),
        sugerido_proc_base,
        similares_referencia: similares,
        ph_faixa_sugerida: ph_faixa,
        viscosidade_faixa_sugerida: visc_faixa,
        densidade_faixa_sugerida: dens_faixa,
        aspecto_sugerido: aspecto,
        cor_sugerida: cor,
        odor_sugerido: odor,
        equipamentos_recomendados: equipamentos,
        epis_recomendados: epis,
        etapas,
        processo_texto_formatado: formatado,
    })
}
