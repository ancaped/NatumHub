# Instalador NatumHub

Esta pasta contém os arquivos relacionados ao instalador e executáveis do NatumHub.

## Estrutura

```
Instalador/
├── README.md           # Este arquivo
└── (executáveis)       # Gerados pelo `cargo tauri build`
```

## Como Gerar o Instalador

1. Execute `cargo tauri build` na raiz do projeto
2. Os arquivos serão gerados em `Backend/target/release/bundle/`
3. Copie o instalador NSIS (`.exe`) para esta pasta

## Atualização Automática

O NatumHub utiliza o **Tauri Updater** integrado com **GitHub Releases** para atualizações automáticas:

- Ao iniciar o app, ele verifica se há uma nova versão no GitHub
- Se houver, o usuário é notificado e pode atualizar com um clique
- A versão é definida em `Cargo.toml` e `tauri.conf.json`
