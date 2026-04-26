export type ServerRole = 'acolito' | 'coroinha';

export interface Server {
  id: string;
  name: string;
  type: ServerRole;
  active: boolean;
  ownerId: string;
}

export interface Mass {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  assignments: {
    acolitos: string[]; // array of server IDs
    coroinhas: string[]; // array of server IDs
  };
  ownerId: string;
}

export type View = 'dashboard' | 'members' | 'masses' | 'schedule';
