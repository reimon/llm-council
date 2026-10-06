import { createContext, useContext, useEffect, useState } from 'react';

const STRINGS = {
  pt: {
    newQuestion: 'Nova pergunta',
    projects: 'Projetos',
    add: 'Adicionar',
    projectsEmpty: 'Adicione a pasta de um projeto para os modelos lerem o código antes de responder.',
    generalQuestions: 'Perguntas gerais',
    noConversations: 'Suas perguntas aparecem aqui.',
    untitled: 'Pergunta sem título',
    notSent: 'Ainda não enviada',
    answered: 'Respondida',
    deleteConversation: 'Apagar conversa',
    deleteNamed: (n) => `Apagar ${n}`,
    newChatInProject: 'Novo chat neste projeto',
    newChatIn: (n) => `Novo chat em ${n}`,
    removeProject: 'Remover projeto',
    removeProjectNamed: (n) => `Remover projeto ${n}`,
    startChatInProject: 'Começar um chat neste projeto',
    projectFolder: 'Pasta do projeto',
    choose: 'Escolher…',
    name: 'Nome',
    namePlaceholder: 'Usa o nome da pasta',
    cancel: 'Cancelar',
    createProject: 'Criar projeto',
    switchLanguage: 'Switch to English',

    welcomeTitle: 'Leve uma pergunta ao conselho',
    welcomeBody: 'Vários modelos respondem, avaliam uns aos outros de forma anônima e um presidente redige a resposta final.',
    welcomeHint: 'Comece em “Nova pergunta”, à esquerda.',
    askAbout: (n) => `O que você quer saber sobre ${n}?`,
    askGeneral: 'Sobre o que o conselho deve opinar?',
    projectNote: 'Cada modelo vai ler os arquivos do projeto antes de responder, sem alterar nada. Com código para explorar, a deliberação pode levar vários minutos.',
    generalNote: 'Faça uma pergunta. A deliberação completa leva um ou dois minutos.',
    yourQuestion: 'Sua pergunta',
    loadingStage1: 'Os modelos estão escrevendo suas respostas…',
    loadingStage2: 'Os modelos estão avaliando uns aos outros…',
    loadingStage3: 'O presidente está redigindo a resposta final…',
    convening: 'Reunindo o conselho…',
    placeholderProject: (n) => `Pergunte sobre ${n}. Use + para anexar imagens, vídeos, pastas ou links.`,
    placeholderGeneral: 'Escreva sua pergunta. Use + para anexar imagens, vídeos, pastas ou links.',

    kindImage: 'Imagem',
    kindVideo: 'Vídeo',
    kindFolder: 'Pasta',
    kindLink: 'Link',
    remove: (n) => `Remover ${n}`,
    addAttachment: 'Adicionar anexo',
    imageOrVideo: 'Imagem ou vídeo',
    folderPlaceholder: '~/caminho/da/pasta',
    addLink: 'Adicionar link',
    addFolder: 'Adicionar pasta',
    uploading: 'Enviando anexos…',
    enterHint: 'Enter envia, Shift+Enter quebra a linha',
    askCouncil: 'Perguntar ao conselho',

    stage1Title: 'Cada modelo responde sozinho',
    stage2Title: 'Os modelos avaliam uns aos outros, às cegas',
    stage2Desc1: 'Cada modelo julgou as respostas como Response A, B, C… sem saber quem escreveu cada uma.',
    stage2Desc2a: 'Os nomes aparecem em ',
    stage2Bold: 'negrito',
    stage2Desc2b: ' aqui só para facilitar a leitura.',
    overallStanding: 'Classificação geral',
    avg: 'média',
    votes: 'votos',
    standingNote: 'Posição média em todos os votos. Quanto menor, melhor.',
    individualEvaluations: 'Avaliações individuais',
    parsedRanking: 'Ranking interpretado',
    stage3Title: 'A resposta do conselho',
    writtenByChair: (n) => `Redigida pelo presidente, ${n}`,

    confirmDeleteConvTitle: 'Apagar conversa?',
    confirmDeleteConvMsg: (t) => `"${t}" será apagada. Isso não pode ser desfeito.`,
    thisConversation: 'esta conversa',
    confirmRemoveProjectTitle: 'Remover projeto?',
    confirmRemoveProjectMsg: (n, c) =>
      `"${n}" e ${c === 1 ? 'seu chat serão removidos' : `seus ${c} chats serão removidos`}. A pasta do projeto no disco não é alterada.`,
  },
  en: {
    newQuestion: 'New question',
    projects: 'Projects',
    add: 'Add',
    projectsEmpty: 'Add a project folder so the models read the code before answering.',
    generalQuestions: 'General questions',
    noConversations: 'Your questions will appear here.',
    untitled: 'Untitled question',
    notSent: 'Not asked yet',
    answered: 'Answered',
    deleteConversation: 'Delete conversation',
    deleteNamed: (n) => `Delete ${n}`,
    newChatInProject: 'New chat in this project',
    newChatIn: (n) => `New chat in ${n}`,
    removeProject: 'Remove project',
    removeProjectNamed: (n) => `Remove project ${n}`,
    startChatInProject: 'Start a chat in this project',
    projectFolder: 'Project folder',
    choose: 'Choose…',
    name: 'Name',
    namePlaceholder: 'Uses the folder name',
    cancel: 'Cancel',
    createProject: 'Create project',
    switchLanguage: 'Mudar para português',

    welcomeTitle: 'Put a question to the council',
    welcomeBody: 'Several models answer, review each other anonymously, and a chair writes the final answer.',
    welcomeHint: 'Start with “New question” on the left.',
    askAbout: (n) => `What do you want to know about ${n}?`,
    askGeneral: 'What should the council weigh in on?',
    projectNote: 'Each model reads the project files before answering, without changing anything. With code to explore, the deliberation can take several minutes.',
    generalNote: 'Ask one question. The full deliberation takes a minute or two.',
    yourQuestion: 'Your question',
    loadingStage1: 'Models are writing their answers…',
    loadingStage2: 'Models are reviewing each other…',
    loadingStage3: 'The chair is writing the final answer…',
    convening: 'Convening the council…',
    placeholderProject: (n) => `Ask about ${n}. Use + to attach images, videos, folders or links.`,
    placeholderGeneral: 'Ask your question. Use + to attach images, videos, folders or links.',

    kindImage: 'Image',
    kindVideo: 'Video',
    kindFolder: 'Folder',
    kindLink: 'Link',
    remove: (n) => `Remove ${n}`,
    addAttachment: 'Add attachment',
    imageOrVideo: 'Image or video',
    folderPlaceholder: '~/path/to/folder',
    addLink: 'Add link',
    addFolder: 'Add folder',
    uploading: 'Uploading attachments…',
    enterHint: 'Enter sends, Shift+Enter adds a line',
    askCouncil: 'Ask the council',

    stage1Title: 'Each model answers on its own',
    stage2Title: 'Models rank each other, blind',
    stage2Desc1: 'Every model judged the answers as Response A, B, C… without knowing who wrote them.',
    stage2Desc2a: 'Names appear in ',
    stage2Bold: 'bold',
    stage2Desc2b: ' here only so you can read along.',
    overallStanding: 'Overall standing',
    avg: 'avg',
    votes: 'votes',
    standingNote: 'Average position across all peer votes. Lower is better.',
    individualEvaluations: 'Individual evaluations',
    parsedRanking: 'Ranking as parsed',
    stage3Title: "The council's answer",
    writtenByChair: (n) => `Written by the chair, ${n}`,

    confirmDeleteConvTitle: 'Delete conversation?',
    confirmDeleteConvMsg: (t) => `"${t}" will be deleted. This can't be undone.`,
    thisConversation: 'this conversation',
    confirmRemoveProjectTitle: 'Remove project?',
    confirmRemoveProjectMsg: (n, c) =>
      `"${n}" and ${c === 1 ? 'its chat' : `its ${c} chats`} will be removed. The project folder on disk is not changed.`,
  },
};

// Titles the backend assigns before the real title is generated
const PLACEHOLDER_TITLES = new Set(['Nova conversa', 'New Conversation']);

const LangContext = createContext(null);

function initialLang() {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'pt' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

export function LangProvider({ children }) {
  const [lang, setLang] = useState(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
    try {
      localStorage.setItem('lang', lang);
    } catch {
      /* storage unavailable */
    }
  }, [lang]);

  const t = (key, ...args) => {
    const value = STRINGS[lang][key] ?? STRINGS.pt[key] ?? key;
    return typeof value === 'function' ? value(...args) : value;
  };
  const title = (raw) => (!raw || PLACEHOLDER_TITLES.has(raw) ? t('untitled') : raw);
  const toggle = () => setLang((l) => (l === 'pt' ? 'en' : 'pt'));

  return <LangContext.Provider value={{ lang, t, title, toggle }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
