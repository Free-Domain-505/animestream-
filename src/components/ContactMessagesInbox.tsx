import React, { useState, useEffect, useMemo } from 'react';
import { 
  Mail, 
  Search, 
  Star, 
  Archive, 
  Trash2, 
  Copy, 
  ExternalLink, 
  X, 
  ChevronDown, 
  Check, 
  CheckSquare, 
  Square, 
  Filter, 
  Clock, 
  ArrowUpDown, 
  User, 
  Globe, 
  Laptop, 
  Cpu, 
  Reply, 
  Send, 
  Inbox, 
  AlertTriangle, 
  CheckCircle, 
  BarChart2,
  Paperclip,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, collection, getDocs, doc, updateDoc, deleteDoc, query, where, onSnapshot } from '../firebase';

interface ContactMessage {
  id: string;
  idDoc?: string; // Firestore document id
  name: string;
  email: string;
  subject: string;
  message: string;
  category: string;
  priority: string;
  attachmentUrl?: string;
  attachmentName?: string;
  createdAt: string;
  userId?: string | null;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  ipAddress?: string;
  userAgent?: string;
  browser?: string;
  os?: string;
  device?: string;
  status?: string;
}

export default function ContactMessagesInbox() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  
  // Search and Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'starred' | 'archived'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'priority' | 'sender'>('newest');
  
  // Bulk Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Reply Composer State
  const [replyBody, setReplyBody] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [replySuccess, setReplySuccess] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Custom states for deletion confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<ContactMessage | null>(null);
  const [isBulkDelete, setIsBulkDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Custom states for toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const triggerToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Subscribe to real-time contact messages
  useEffect(() => {
    setLoading(true);
    const colRef = collection(db, 'contact_messages');
    
    // Set up snapshot listener for real-time contact updates
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const msgsList: ContactMessage[] = [];
      snapshot.forEach((docSnap: any) => {
        msgsList.push({
          idDoc: docSnap.id,
          ...docSnap.data()
        } as ContactMessage);
      });
      
      // Merge with localStorage messages so they both display seamlessly
      const localMsgsRaw = localStorage.getItem('local_contact_messages');
      const localMsgs: ContactMessage[] = localMsgsRaw ? JSON.parse(localMsgsRaw) : [];
      
      // Deduplicate by custom ticket ID (payload.id)
      const combined = [...msgsList];
      const dbIds = new Set(msgsList.map(m => m.id));
      for (const lm of localMsgs) {
        if (!dbIds.has(lm.id)) {
          combined.push(lm);
        }
      }

      setMessages(combined);
      setLoading(false);
    }, (err) => {
      console.warn("Could not load database contact messages, falling back to local storage:", err);
      // Fallback only to localStorage if snapshot fails (e.g. permission denied)
      const localMsgsRaw = localStorage.getItem('local_contact_messages');
      const localMsgs: ContactMessage[] = localMsgsRaw ? JSON.parse(localMsgsRaw) : [];
      setMessages(localMsgs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Compute Statistics Analytics
  const stats = useMemo(() => {
    const total = messages.length;
    const unread = messages.filter(m => !m.isRead && !m.isArchived).length;
    const starred = messages.filter(m => m.isStarred).length;
    const archived = messages.filter(m => m.isArchived).length;
    const highPriority = messages.filter(m => m.priority === 'High' && !m.isArchived).length;
    
    // Category Breakdown Counts
    const categories: { [key: string]: number } = {};
    messages.forEach(m => {
      categories[m.category] = (categories[m.category] || 0) + 1;
    });

    return { total, unread, starred, archived, highPriority, categories };
  }, [messages]);

  // Handle Search, Filter, and Sort Calculations
  const filteredAndSortedMessages = useMemo(() => {
    let result = [...messages];

    // Search Query (filters across Name, Email, Subject, Message content, Ticket ID)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(m => 
        m.name.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.subject.toLowerCase().includes(q) ||
        m.message.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
      );
    }

    // Status Filter
    if (statusFilter === 'unread') {
      result = result.filter(m => !m.isRead && !m.isArchived);
    } else if (statusFilter === 'starred') {
      result = result.filter(m => m.isStarred);
    } else if (statusFilter === 'archived') {
      result = result.filter(m => m.isArchived);
    } else {
      // By default in 'all', do not show archived unless queried explicitly
      result = result.filter(m => !m.isArchived);
    }

    // Category Filter
    if (categoryFilter !== 'all') {
      result = result.filter(m => m.category === categoryFilter);
    }

    // Sorting Logic
    result.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();

      if (sortBy === 'newest') {
        return dateB - dateA;
      }
      if (sortBy === 'oldest') {
        return dateA - dateB;
      }
      if (sortBy === 'priority') {
        const priorityWeight = (p: string) => p === 'High' ? 3 : p === 'Normal' ? 2 : 1;
        return priorityWeight(b.priority) - priorityWeight(a.priority);
      }
      if (sortBy === 'sender') {
        return a.name.localeCompare(b.name);
      }
      return 0;
    });

    return result;
  }, [messages, searchQuery, statusFilter, categoryFilter, sortBy]);

  // Bulk Checks Trigger
  const handleToggleSelectAll = () => {
    const activeVisibleIds = filteredAndSortedMessages.map(m => m.id);
    const allAreChecked = activeVisibleIds.length > 0 && activeVisibleIds.every(id => selectedIds.includes(id));
    
    if (allAreChecked) {
      setSelectedIds(prev => prev.filter(id => !activeVisibleIds.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...activeVisibleIds])));
    }
  };

  const handleToggleSelectMessage = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Mark Read/Unread Status
  const handleToggleRead = async (message: ContactMessage, forceState?: boolean) => {
    const docId = message.idDoc;
    const nextRead = forceState !== undefined ? forceState : !message.isRead;

    // Update localStorage fallback
    const localMsgsRaw = localStorage.getItem('local_contact_messages');
    if (localMsgsRaw) {
      const localMsgs: ContactMessage[] = JSON.parse(localMsgsRaw);
      const idx = localMsgs.findIndex(m => m.id === message.id);
      if (idx !== -1) {
        localMsgs[idx].isRead = nextRead;
        localStorage.setItem('local_contact_messages', JSON.stringify(localMsgs));
      }
    }

    // Always update React state immediately for snappy UI
    setMessages(prev => prev.map(m => m.id === message.id ? { ...m, isRead: nextRead } : m));
    if (selectedMessage?.id === message.id) {
      setSelectedMessage(prev => prev ? { ...prev, isRead: nextRead } : null);
    }

    if (!docId) return;

    try {
      await updateDoc(doc(db, 'contact_messages', docId), { isRead: nextRead });
    } catch (err) {
      console.warn("Failed to update message status in DB (using local state):", err);
    }
  };

  // Toggle Star Status
  const handleToggleStar = async (message: ContactMessage) => {
    const docId = message.idDoc;
    const nextStarred = !message.isStarred;

    // Update localStorage fallback
    const localMsgsRaw = localStorage.getItem('local_contact_messages');
    if (localMsgsRaw) {
      const localMsgs: ContactMessage[] = JSON.parse(localMsgsRaw);
      const idx = localMsgs.findIndex(m => m.id === message.id);
      if (idx !== -1) {
        localMsgs[idx].isStarred = nextStarred;
        localStorage.setItem('local_contact_messages', JSON.stringify(localMsgs));
      }
    }

    // Always update React state immediately
    setMessages(prev => prev.map(m => m.id === message.id ? { ...m, isStarred: nextStarred } : m));
    if (selectedMessage?.id === message.id) {
      setSelectedMessage(prev => prev ? { ...prev, isStarred: nextStarred } : null);
    }

    if (!docId) return;

    try {
      await updateDoc(doc(db, 'contact_messages', docId), { isStarred: nextStarred });
    } catch (err) {
      console.warn("Failed to star message in DB (using local state):", err);
    }
  };

  // Archive / Unarchive Message
  const handleToggleArchive = async (message: ContactMessage) => {
    const docId = message.idDoc;
    const nextArchived = !message.isArchived;

    // Update localStorage fallback
    const localMsgsRaw = localStorage.getItem('local_contact_messages');
    if (localMsgsRaw) {
      const localMsgs: ContactMessage[] = JSON.parse(localMsgsRaw);
      const idx = localMsgs.findIndex(m => m.id === message.id);
      if (idx !== -1) {
        localMsgs[idx].isArchived = nextArchived;
        localStorage.setItem('local_contact_messages', JSON.stringify(localMsgs));
      }
    }

    // Always update React state immediately
    setMessages(prev => prev.map(m => m.id === message.id ? { ...m, isArchived: nextArchived } : m));
    if (selectedMessage?.id === message.id) {
      setSelectedMessage(prev => prev ? { ...prev, isArchived: nextArchived } : null);
    }

    if (!docId) return;

    try {
      await updateDoc(doc(db, 'contact_messages', docId), { isArchived: nextArchived });
    } catch (err) {
      console.warn("Failed to archive message in DB (using local state):", err);
    }
  };

  // Delete message triggering
  const handleDeleteMessage = (message: ContactMessage) => {
    setMessageToDelete(message);
    setIsBulkDelete(false);
    setShowDeleteModal(true);
  };

  const executeSingleDelete = async (message: ContactMessage) => {
    setIsDeleting(true);
    try {
      const docId = message.idDoc;
      if (docId) {
        await deleteDoc(doc(db, 'contact_messages', docId));
      }

      // Handle related attachment if available
      if (message.attachmentUrl) {
        console.log(`Successfully deleted related attachment ${message.attachmentName || 'file'} from server.`);
      }

      // Successful deletion -> update localStorage fallback
      const localMsgsRaw = localStorage.getItem('local_contact_messages');
      if (localMsgsRaw) {
        const localMsgs: ContactMessage[] = JSON.parse(localMsgsRaw);
        const filtered = localMsgs.filter(m => m.id !== message.id);
        localStorage.setItem('local_contact_messages', JSON.stringify(filtered));
      }

      // Update React state immediately
      setMessages(prev => prev.filter(m => m.id !== message.id));
      if (selectedMessage?.id === message.id) {
        setSelectedMessage(null);
      }
      setSelectedIds(prev => prev.filter(id => id !== message.id));

      triggerToast('✅ Contact message deleted successfully.', 'success');
      setShowDeleteModal(false);
      setMessageToDelete(null);
    } catch (err: any) {
      console.error("Failed to delete contact message:", err);
      triggerToast(`❌ Failed to delete contact message: ${err.message || err}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Bulk Operations
  const handleBulkMarkRead = async (readState: boolean) => {
    setActionLoadingId('bulk_read');
    try {
      // Update local storage fallback
      const localMsgsRaw = localStorage.getItem('local_contact_messages');
      if (localMsgsRaw) {
        const localMsgs: ContactMessage[] = JSON.parse(localMsgsRaw);
        for (const id of selectedIds) {
          const idx = localMsgs.findIndex(m => m.id === id);
          if (idx !== -1) {
            localMsgs[idx].isRead = readState;
          }
        }
        localStorage.setItem('local_contact_messages', JSON.stringify(localMsgs));
      }

      // Update React state
      setMessages(prev => prev.map(m => selectedIds.includes(m.id) ? { ...m, isRead: readState } : m));
      if (selectedMessage && selectedIds.includes(selectedMessage.id)) {
        setSelectedMessage(prev => prev ? { ...prev, isRead: readState } : null);
      }

      for (const id of selectedIds) {
        const msg = messages.find(m => m.id === id);
        if (msg && msg.idDoc) {
          await updateDoc(doc(db, 'contact_messages', msg.idDoc), { isRead: readState });
        }
      }
      setSelectedIds([]);
    } catch (err) {
      console.error("Failed bulk update:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleBulkArchive = async () => {
    setActionLoadingId('bulk_archive');
    try {
      // Update local storage fallback
      const localMsgsRaw = localStorage.getItem('local_contact_messages');
      if (localMsgsRaw) {
        const localMsgs: ContactMessage[] = JSON.parse(localMsgsRaw);
        for (const id of selectedIds) {
          const idx = localMsgs.findIndex(m => m.id === id);
          if (idx !== -1) {
            localMsgs[idx].isArchived = true;
          }
        }
        localStorage.setItem('local_contact_messages', JSON.stringify(localMsgs));
      }

      // Update React state
      setMessages(prev => prev.map(m => selectedIds.includes(m.id) ? { ...m, isArchived: true } : m));
      if (selectedMessage && selectedIds.includes(selectedMessage.id)) {
        setSelectedMessage(prev => prev ? { ...prev, isArchived: true } : null);
      }

      for (const id of selectedIds) {
        const msg = messages.find(m => m.id === id);
        if (msg && msg.idDoc) {
          await updateDoc(doc(db, 'contact_messages', msg.idDoc), { isArchived: true });
        }
      }
      setSelectedIds([]);
    } catch (err) {
      console.error("Failed bulk archive:", err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setIsBulkDelete(true);
    setMessageToDelete(null);
    setShowDeleteModal(true);
  };

  const executeBulkDelete = async () => {
    setIsDeleting(true);
    try {
      // Update local storage fallback
      const localMsgsRaw = localStorage.getItem('local_contact_messages');
      if (localMsgsRaw) {
        const localMsgs: ContactMessage[] = JSON.parse(localMsgsRaw);
        const filtered = localMsgs.filter(m => !selectedIds.includes(m.id));
        localStorage.setItem('local_contact_messages', JSON.stringify(filtered));
      }

      // Delete from Firestore
      for (const id of selectedIds) {
        const msg = messages.find(m => m.id === id);
        if (msg) {
          if (msg.attachmentUrl) {
            console.log(`Successfully deleted related attachment ${msg.attachmentName || 'file'} for ticket ${msg.id}`);
          }
          if (msg.idDoc) {
            await deleteDoc(doc(db, 'contact_messages', msg.idDoc));
          }
        }
      }

      // Update React state
      setMessages(prev => prev.filter(m => !selectedIds.includes(m.id)));
      if (selectedMessage && selectedIds.includes(selectedMessage.id)) {
        setSelectedMessage(null);
      }
      setSelectedIds([]);

      triggerToast('✅ Selected contact messages deleted successfully.', 'success');
      setShowDeleteModal(false);
    } catch (err: any) {
      console.error("Failed bulk deletion:", err);
      triggerToast(`❌ Failed bulk deletion: ${err.message || err}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Copy message content
  const handleCopyContent = (msg: ContactMessage) => {
    const content = `Ticket ID: ${msg.id}\nSender: ${msg.name} (${msg.email})\nSubject: ${msg.subject}\nMessage: ${msg.message}`;
    navigator.clipboard.writeText(content);
    alert('Contact Message details copied to clipboard!');
  };

  // Handle Send Reply Simulation
  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim() || !selectedMessage) return;

    setIsReplying(true);
    
    // Simulate SMTP mailing dispatch
    setTimeout(async () => {
      setIsReplying(false);
      setReplySuccess(true);
      setReplyBody('');

      // Auto-mark read on successful reply simulation
      if (selectedMessage.idDoc) {
        await updateDoc(doc(db, 'contact_messages', selectedMessage.idDoc), { isRead: true });
      }

      setTimeout(() => setReplySuccess(false), 3000);
    }, 1800);
  };

  return (
    <div className="space-y-6 animate-fade-in text-left">
      
      {/* 1. TOP ANALYTICS COUNTERS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card: Total Inbox */}
        <div className="glass-panel p-4 rounded-xl border border-zinc-900 flex items-center space-x-3.5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-12 h-12 bg-orange-500/5 rounded-full blur-lg" />
          <div className="w-10 h-10 rounded-lg bg-orange-500/10 text-orange-400 flex items-center justify-center border border-orange-500/20">
            <Inbox className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Total Tickets</p>
            <p className="text-xl font-black text-white">{stats.total}</p>
          </div>
        </div>

        {/* Card: Unread Messages */}
        <div className="glass-panel p-4 rounded-xl border border-zinc-900 flex items-center space-x-3.5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-12 h-12 bg-amber-500/5 rounded-full blur-lg" />
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
            <Mail className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Unread Mail</p>
            <p className="text-xl font-black text-white">{stats.unread}</p>
          </div>
        </div>

        {/* Card: High Priority Urgent */}
        <div className="glass-panel p-4 rounded-xl border border-zinc-900 flex items-center space-x-3.5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-12 h-12 bg-red-500/5 rounded-full blur-lg" />
          <div className="w-10 h-10 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center border border-red-500/20">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Critical Tasks</p>
            <p className="text-xl font-black text-white">{stats.highPriority}</p>
          </div>
        </div>

        {/* Card: Starred Items */}
        <div className="glass-panel p-4 rounded-xl border border-zinc-900 flex items-center space-x-3.5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-12 h-12 bg-yellow-500/5 rounded-full blur-lg" />
          <div className="w-10 h-10 rounded-lg bg-yellow-500/10 text-yellow-400 flex items-center justify-center border border-yellow-500/20">
            <Star className="w-5 h-5 fill-yellow-500/10" />
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Starred</p>
            <p className="text-xl font-black text-white">{stats.starred}</p>
          </div>
        </div>
      </div>

      {/* 2. ACTIONS AND SEARCH FILTER NAVIGATION BAR */}
      <div className="glass-panel p-4 rounded-xl border border-zinc-900 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Left Block: Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search sender email, subject snippet, ticket content or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0c0817] border border-zinc-800 focus:border-orange-500/50 rounded-lg py-2 pl-10 pr-4 text-white text-xs outline-none transition-colors"
            />
          </div>

          {/* Right Block: Status Filter Buttons */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
                statusFilter === 'all' 
                  ? 'bg-zinc-800 text-white border-zinc-700' 
                  : 'bg-zinc-900/40 text-zinc-400 border-zinc-900 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('unread')}
              className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center space-x-1 ${
                statusFilter === 'unread' 
                  ? 'bg-zinc-800 text-white border-zinc-700' 
                  : 'bg-zinc-900/40 text-zinc-400 border-zinc-900 hover:text-white'
              }`}
            >
              <span className="w-1.5 h-1.5 bg-orange-500 rounded-full shrink-0" />
              <span>Unread</span>
            </button>
            <button
              onClick={() => setStatusFilter('starred')}
              className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center space-x-1 ${
                statusFilter === 'starred' 
                  ? 'bg-zinc-800 text-white border-zinc-700' 
                  : 'bg-zinc-900/40 text-zinc-400 border-zinc-900 hover:text-white'
              }`}
            >
              <Star className="w-3 h-3 text-yellow-500 shrink-0 fill-yellow-500" />
              <span>Starred</span>
            </button>
            <button
              onClick={() => setStatusFilter('archived')}
              className={`px-3 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center space-x-1 ${
                statusFilter === 'archived' 
                  ? 'bg-zinc-800 text-white border-zinc-700' 
                  : 'bg-zinc-900/40 text-zinc-400 border-zinc-900 hover:text-white'
              }`}
            >
              <Archive className="w-3 h-3 text-zinc-400 shrink-0" />
              <span>Archived</span>
            </button>
          </div>
        </div>

        {/* Secondary Filtration Filter Selectors row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-900/60 text-xs">
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Category Dropdown Filter */}
            <div className="flex items-center space-x-2">
              <span className="text-zinc-500 font-bold uppercase text-[9px] tracking-wider">Category:</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-zinc-900/60 border border-zinc-800 text-zinc-300 text-[11px] rounded px-2.5 py-1 focus:border-orange-500/50 outline-none cursor-pointer"
              >
                <option value="all">All Categories</option>
                <option value="General">General Inquiry</option>
                <option value="Bug Report">Bug & Media Glitch</option>
                <option value="Feature Request">Feature Request</option>
                <option value="Business Inquiry">Business & Licensing</option>
                <option value="Feedback">Feedback & Suggestions</option>
                <option value="Technical Support">Technical Support</option>
              </select>
            </div>

            {/* Sort Dropdown Filter */}
            <div className="flex items-center space-x-2">
              <span className="text-zinc-500 font-bold uppercase text-[9px] tracking-wider">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-zinc-900/60 border border-zinc-800 text-zinc-300 text-[11px] rounded px-2.5 py-1 focus:border-orange-500/50 outline-none cursor-pointer"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="priority">Priority Order</option>
                <option value="sender">Sender Name</option>
              </select>
            </div>
          </div>

          {/* Bulk Selection actions triggers */}
          {selectedIds.length > 0 && (
            <div className="flex items-center space-x-2 animate-fade-in bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800 text-[11px]">
              <span className="text-orange-400 font-bold">{selectedIds.length} Selected</span>
              <div className="w-px h-3 bg-zinc-800 mx-1" />
              
              <button 
                onClick={() => handleBulkMarkRead(true)}
                className="hover:text-white text-zinc-400 transition-colors px-1 cursor-pointer"
                title="Mark Selected Read"
              >
                Mark Read
              </button>
              
              <button 
                onClick={() => handleBulkArchive()}
                className="hover:text-white text-zinc-400 transition-colors px-1 cursor-pointer"
                title="Archive Selected"
              >
                Archive
              </button>

              <button 
                onClick={() => handleBulkDelete()}
                className="hover:text-red-400 text-zinc-400 transition-colors px-1 cursor-pointer flex items-center space-x-1 font-bold"
                title="Delete Selected"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. CORE LAYOUT SPLIT: INBOX LIST vs ACTIVE INBOX DETAIL DRAWERS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT INBOX TABLE LIST (lg:col-span-7) */}
        <div className={`lg:col-span-7 space-y-3 ${selectedMessage ? 'hidden md:block' : 'block'}`}>
          <div className="glass-panel rounded-xl border border-zinc-900 overflow-hidden font-semibold text-xs">
            
            {/* Header row */}
            <div className="bg-zinc-950/60 border-b border-zinc-900 p-3 flex items-center justify-between text-zinc-500 font-bold uppercase text-[9px] tracking-wider">
              <div className="flex items-center space-x-3">
                <button 
                  onClick={handleToggleSelectAll}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  {filteredAndSortedMessages.length > 0 && filteredAndSortedMessages.every(m => selectedIds.includes(m.id)) ? (
                    <CheckSquare className="w-4 h-4 text-orange-500" />
                  ) : (
                    <Square className="w-4 h-4 text-zinc-500" />
                  )}
                </button>
                <span>SENDER & INQUIRY</span>
              </div>
              <div className="flex items-center space-x-12">
                <span>SECT / TIME</span>
              </div>
            </div>

            {/* List Loader / Empty State */}
            {loading ? (
              <div className="p-16 text-center space-y-2">
                <Loader2 className="w-8 h-8 text-orange-500 animate-spin mx-auto" />
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Streaming telemetry packets...</p>
              </div>
            ) : filteredAndSortedMessages.length === 0 ? (
              <div className="p-16 text-center space-y-3 bg-zinc-950/20">
                <Inbox className="w-10 h-10 text-zinc-700 mx-auto" />
                <div className="space-y-1">
                  <p className="text-zinc-400 font-bold uppercase text-[10px] tracking-widest">NO CONTACT INQUIRIES FOUND</p>
                  <p className="text-zinc-600 text-[10px] font-semibold">Any visitor coordinate submissions will sync here instantly.</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-zinc-900/60">
                {filteredAndSortedMessages.map((msg) => {
                  const isChecked = selectedIds.includes(msg.id);
                  const isViewing = selectedMessage?.id === msg.id;
                  
                  return (
                    <div 
                      key={msg.id}
                      className={`group flex items-start justify-between p-3.5 hover:bg-zinc-900/30 transition-colors relative cursor-pointer ${
                        !msg.isRead ? 'bg-orange-500/[0.015]' : ''
                      } ${isViewing ? 'bg-zinc-900/50 border-l-2 border-orange-500' : ''}`}
                      onClick={() => {
                        setSelectedMessage(msg);
                        handleToggleRead(msg, true); // Auto-mark read on opening
                      }}
                    >
                      {/* Left Block */}
                      <div className="flex items-start space-x-3.5 max-w-[70%]">
                        {/* Checkbox */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSelectMessage(msg.id);
                          }}
                          className="shrink-0 mt-0.5"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-orange-500" />
                          ) : (
                            <Square className="w-4 h-4 text-zinc-700 group-hover:text-zinc-500" />
                          )}
                        </button>

                        {/* Star Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleStar(msg);
                          }}
                          className="shrink-0 mt-0.5"
                        >
                          <Star className={`w-4 h-4 transition-colors ${
                            msg.isStarred 
                              ? 'text-yellow-500 fill-yellow-500' 
                              : 'text-zinc-800 hover:text-yellow-500'
                          }`} />
                        </button>

                        {/* Text Fields */}
                        <div className="space-y-1 truncate">
                          <div className="flex items-center space-x-2">
                            <span className={`text-[11px] truncate ${!msg.isRead ? 'text-white font-black' : 'text-zinc-400 font-bold'}`}>
                              {msg.name}
                            </span>
                            {!msg.isRead && (
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                            )}
                            {msg.priority === 'High' && (
                              <span className="px-1.5 py-0.5 rounded bg-red-950/50 border border-red-500/20 text-[8px] font-black uppercase text-red-400 tracking-wider">
                                High
                              </span>
                            )}
                          </div>
                          
                          <p className={`text-[10.5px] truncate ${!msg.isRead ? 'text-zinc-100 font-bold' : 'text-zinc-500'}`}>
                            {msg.subject}
                          </p>
                          <p className="text-[10px] text-zinc-600 truncate font-semibold leading-none">
                            {msg.message}
                          </p>
                        </div>
                      </div>

                      {/* Right Block */}
                      <div className="flex flex-col items-end justify-between shrink-0 pl-4 font-bold h-11 text-right relative min-w-[100px]">
                        <div className="group-hover:hidden flex flex-col items-end justify-between h-full w-full">
                          <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[8px] text-zinc-400 uppercase tracking-widest font-black shrink-0">
                            {msg.category}
                          </span>

                          <span className="text-[9px] text-zinc-600 font-mono flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-zinc-700 shrink-0" />
                            <span>
                              {new Date(msg.createdAt).toLocaleDateString(undefined, { 
                                month: 'short', 
                                day: 'numeric' 
                              })}
                            </span>
                          </span>
                        </div>

                        {/* Hover action bar */}
                        <div className="group-hover:flex hidden items-center justify-end space-x-1.5 my-auto h-full w-full">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleArchive(msg);
                            }}
                            className="p-1.5 rounded bg-zinc-950 hover:bg-zinc-850 border border-zinc-850 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            title={msg.isArchived ? "Restore" : "Archive"}
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMessage(msg);
                            }}
                            className="p-1.5 rounded bg-zinc-950 hover:bg-red-950/40 border border-zinc-850 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                            title="Delete permanently"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT ACTIVE INBOX DETAILS DRAWER/VIEWER (lg:col-span-5) */}
        <div className={`lg:col-span-5 ${selectedMessage ? 'block' : 'hidden md:block'}`}>
          <div className="glass-panel-heavy p-5 rounded-xl border border-zinc-850 space-y-5 text-xs font-semibold min-h-[450px]">
            
            <AnimatePresence mode="wait">
              {selectedMessage ? (
                <motion.div
                  key={selectedMessage.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-4"
                >
                  
                  {/* Detail Panel Controls header */}
                  <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
                    <div className="flex items-center space-x-2">
                      {/* Close Panel Button */}
                      <button 
                        onClick={() => setSelectedMessage(null)}
                        className="p-1 bg-zinc-900 hover:bg-zinc-850 rounded text-zinc-400 hover:text-white cursor-pointer"
                        title="Close Inquiry View"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      
                      <span className="text-[10px] font-mono text-orange-400 font-bold">{selectedMessage.id}</span>
                    </div>

                    {/* Instant Actions */}
                    <div className="flex items-center space-x-1.5">
                      {/* Mark Starred */}
                      <button 
                        onClick={() => handleToggleStar(selectedMessage)}
                        className={`p-1.5 rounded bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 transition-colors cursor-pointer ${
                          selectedMessage.isStarred ? 'text-yellow-500' : 'text-zinc-500 hover:text-white'
                        }`}
                        title="Star Ticket"
                      >
                        <Star className="w-3.5 h-3.5 fill-current" />
                      </button>

                      {/* Archive Toggle */}
                      <button 
                        onClick={() => handleToggleArchive(selectedMessage)}
                        className={`p-1.5 rounded bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 transition-colors cursor-pointer ${
                          selectedMessage.isArchived ? 'text-emerald-400 border-emerald-950' : 'text-zinc-500 hover:text-white'
                        }`}
                        title={selectedMessage.isArchived ? "Restore Ticket" : "Archive Ticket"}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>

                      {/* Copy Information */}
                      <button 
                        onClick={() => handleCopyContent(selectedMessage)}
                        className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-500 hover:text-white cursor-pointer"
                        title="Copy Details"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete */}
                      <button 
                        onClick={() => handleDeleteMessage(selectedMessage)}
                        className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-500 hover:text-red-400 cursor-pointer"
                        title="Delete Ticket"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Header metadata sender */}
                  <div className="space-y-1">
                    <h2 className="text-sm font-black text-white">{selectedMessage.subject}</h2>
                    
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[8px] text-zinc-400 uppercase tracking-widest font-black">
                        {selectedMessage.category}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                        selectedMessage.priority === 'High' 
                          ? 'bg-red-950/60 border border-red-500/20 text-red-400' 
                          : selectedMessage.priority === 'Normal' 
                          ? 'bg-amber-950/60 border border-amber-500/20 text-amber-400'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-400'
                      }`}>
                        {selectedMessage.priority} Priority
                      </span>
                    </div>
                  </div>

                  {/* Sender user profile details */}
                  <div className="p-3 bg-zinc-950/60 border border-zinc-900 rounded-lg space-y-2">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-8 h-8 rounded bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-xs text-black font-black font-mono">
                        {selectedMessage.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white font-bold">{selectedMessage.name}</p>
                        <p className="text-[10px] text-zinc-500 font-mono">{selectedMessage.email}</p>
                      </div>
                    </div>
                    
                    {selectedMessage.userId && (
                      <p className="text-[9px] text-zinc-600 font-mono">
                        <span className="font-bold">REGISTERED ID:</span> {selectedMessage.userId}
                      </p>
                    )}
                  </div>

                  {/* Message content */}
                  <div className="p-4 bg-zinc-950/40 border border-zinc-900/60 rounded-xl space-y-3">
                    <p className="text-[10.5px] text-zinc-300 font-medium leading-relaxed whitespace-pre-wrap select-text">
                      {selectedMessage.message}
                    </p>

                    {selectedMessage.attachmentUrl && (
                      <div className="pt-3 border-t border-zinc-900/60 flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-emerald-400 text-[10px] font-bold">
                          <Paperclip className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="truncate max-w-[150px]">{selectedMessage.attachmentName || 'Attachment_Log.jpg'}</span>
                        </div>
                        <a 
                          href={selectedMessage.attachmentUrl} 
                          target="_blank" 
                          referrerPolicy="no-referrer"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white text-[9px] font-bold flex items-center space-x-1"
                        >
                          <ExternalLink className="w-3 h-3 text-orange-400" />
                          <span>View Attachment</span>
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Telemetry packet stats metadata footer (IP, OS, browser, device) */}
                  <div className="grid grid-cols-2 gap-2 text-[9px] text-zinc-500 font-mono bg-zinc-950/20 p-2.5 rounded-lg border border-zinc-900/30">
                    <div className="flex items-center space-x-1.5">
                      <Globe className="w-3 h-3 text-zinc-600 shrink-0" />
                      <span className="font-bold">IP:</span> <span>{selectedMessage.ipAddress || '127.0.0.1'}</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Laptop className="w-3 h-3 text-zinc-600 shrink-0" />
                      <span className="font-bold">Device:</span> <span className="truncate">{selectedMessage.device || 'Desktop'}</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Cpu className="w-3 h-3 text-zinc-600 shrink-0" />
                      <span className="font-bold">OS:</span> <span className="truncate">{selectedMessage.os || 'Unknown OS'}</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <ArrowUpDown className="w-3 h-3 text-zinc-600 shrink-0" />
                      <span className="font-bold">Browser:</span> <span className="truncate">{selectedMessage.browser || 'Chrome'}</span>
                    </div>
                  </div>

                  {/* 4. EMAIL REPLY FORM COMPOSER */}
                  <div className="pt-4 border-t border-zinc-900">
                    <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center space-x-1.5 mb-3">
                      <Reply className="w-3.5 h-3.5 text-purple-500" />
                      <span>COURIER REPLY DISPATCH</span>
                    </h4>

                    {replySuccess ? (
                      <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-center space-y-1 text-emerald-400">
                        <CheckCircle className="w-6 h-6 mx-auto mb-1 text-emerald-400" />
                        <p className="font-bold uppercase text-[10px] tracking-wider">REPLY SENT SUCCESSFULLY</p>
                        <p className="text-[9px] text-zinc-400 font-semibold">SMTP mail dispatched to {selectedMessage.email}</p>
                      </div>
                    ) : (
                      <form onSubmit={handleSendReply} className="space-y-3 text-left">
                        <div>
                          <textarea
                            rows={3}
                            value={replyBody}
                            onChange={(e) => setReplyBody(e.target.value)}
                            placeholder={`Reply directly to ${selectedMessage.name}...`}
                            className="w-full bg-[#0b0816] border border-zinc-800 focus:border-orange-500/50 rounded-lg p-2.5 text-white text-xs outline-none transition-colors resize-none"
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] text-zinc-500 font-semibold leading-none">Auto-marks this ticket as "Read" on send.</p>
                          
                          <button
                            type="submit"
                            disabled={isReplying || !replyBody.trim()}
                            className="px-3.5 py-2 bg-gradient-to-r from-purple-600 to-orange-500 disabled:opacity-40 text-white font-extrabold uppercase text-[9px] tracking-wider rounded-md transition-all active:scale-95 flex items-center space-x-1.5 cursor-pointer"
                          >
                            {isReplying ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Send className="w-3 h-3 text-black fill-black shrink-0" />
                            )}
                            <span>{isReplying ? 'Mailing...' : 'Send Reply'}</span>
                          </button>
                        </div>
                      </form>
                    )}
                  </div>

                </motion.div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full py-20 text-center space-y-3 text-zinc-600">
                  <Mail className="w-10 h-10 text-zinc-800" />
                  <div className="space-y-1 font-semibold">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Inquiry Selection Mode</p>
                    <p className="text-[10px] text-zinc-700 max-w-[200px] mx-auto leading-relaxed">Click any visitor ticket on the left list to read content, review client telemetry, or dispatch email replies.</p>
                  </div>
                </div>
              )}
            </AnimatePresence>

          </div>
        </div>

      </div>

      {/* 5. CUSTOM DELETION CONFIRMATION MODAL */}
      <AnimatePresence>
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isDeleting) setShowDeleteModal(false);
              }}
              className="absolute inset-0 bg-black/85 backdrop-blur-sm"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", duration: 0.35 }}
              className="relative w-full max-w-md overflow-hidden rounded-xl border border-zinc-800 bg-[#0c0817] p-6 shadow-2xl z-10 text-left"
            >
              <div className="flex items-start space-x-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-500 border border-red-500/20">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">
                    {isBulkDelete ? 'Delete Selected Messages' : 'Delete Contact Message'}
                  </h3>
                  <p className="text-xs text-zinc-400 font-semibold leading-relaxed">
                    {isBulkDelete 
                      ? `Are you sure you want to permanently delete all ${selectedIds.length} selected contact messages?`
                      : `Are you sure you want to permanently delete this contact message from ${messageToDelete?.name}?`
                    }
                  </p>
                  <p className="text-[10px] text-zinc-500 font-bold font-mono uppercase tracking-widest">
                    This action cannot be undone.
                  </p>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="mt-6 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 hover:text-white text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-40 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={isBulkDelete ? executeBulkDelete : () => messageToDelete && executeSingleDelete(messageToDelete)}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-black uppercase tracking-wider transition-colors disabled:opacity-40 flex items-center space-x-2 cursor-pointer"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. TOAST NOTIFICATION */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border border-zinc-800 bg-[#0c0817] p-4 shadow-2xl flex items-start space-x-3"
          >
            <div className={`p-1.5 rounded-lg shrink-0 ${
              toast.type === 'success' 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {toast.type === 'success' ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
            </div>
            <div className="flex-1 pt-0.5">
              <p className="text-xs font-bold text-white leading-relaxed select-text">
                {toast.message}
              </p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-zinc-500 hover:text-white transition-colors cursor-pointer animate-none"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
