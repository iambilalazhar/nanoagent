'use client';

import { useState, useRef } from 'react';
import { PromptInput, PromptInputTextarea, PromptInputToolbar, PromptInputTools, PromptInputButton, PromptInputSubmit } from '@/components/ai-elements/prompt-input';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Response } from '@/components/ai-elements/response';
import { Loader } from '@/components/ai-elements/loader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PaperclipIcon, XIcon, ImageIcon } from 'lucide-react';

type StreamData = {
	type: 'status' | 'iteration' | 'image' | 'evaluation' | 'complete' | 'error' | 'final';
	message?: string;
	index?: number;
	iteration?: number;
	base64?: string;
	mediaType?: string;
	feedback?: string;
	isAcceptable?: boolean;
};

type ConversationMessage = {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	images?: string[];
	streamData?: StreamData[];
};

export default function AgentPlayground() {
	const [status, setStatus] = useState<'idle' | 'streaming'>('idle');
	const [prompt, setPrompt] = useState('');
	const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
	const [messages, setMessages] = useState<ConversationMessage[]>([]);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileAttach = (files: FileList | null) => {
		if (!files) return;
		const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
		setAttachedFiles(prev => [...prev, ...imageFiles]);
	};

	const removeFile = (index: number) => {
		setAttachedFiles(prev => prev.filter((_, i) => i !== index));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!prompt.trim() || attachedFiles.length === 0 || status === 'streaming') return;

		const userMessage: ConversationMessage = {
			id: Date.now().toString(),
			role: 'user',
			content: prompt,
			images: attachedFiles.map(file => URL.createObjectURL(file))
		};

		const assistantMessage: ConversationMessage = {
			id: (Date.now() + 1).toString(),
			role: 'assistant',
			content: '',
			streamData: []
		};

		setMessages(prev => [...prev, userMessage, assistantMessage]);
		setStatus('streaming');

		try {
			const formData = new FormData();
			formData.append('prompt', prompt);
			formData.append('maxIterations', '10');
			attachedFiles.forEach(file => formData.append('image', file));

			const response = await fetch('/api/ai/agent/image-edit', {
				method: 'POST',
				body: formData,
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const reader = response.body?.getReader();
			if (!reader) throw new Error('No response body');

			const decoder = new TextDecoder();
			let buffer = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() || '';

				for (const line of lines) {
					if (line.trim().startsWith('0:')) {
						try {
							const jsonStr = line.slice(2);
							const data: StreamData = JSON.parse(jsonStr);
							
							setMessages(prev => prev.map(msg => 
								msg.id === assistantMessage.id 
									? { ...msg, streamData: [...(msg.streamData || []), data] }
									: msg
							));
						} catch (e) {
							console.warn('Failed to parse stream data:', line);
						}
					}
				}
			}
		} catch (error) {
			console.error('Stream error:', error);
			setMessages(prev => prev.map(msg => 
				msg.id === assistantMessage.id 
					? { ...msg, streamData: [{ type: 'error', message: 'Failed to process request' }] }
					: msg
			));
		} finally {
			setStatus('idle');
			setPrompt('');
			setAttachedFiles([]);
		}
	};

	const renderStreamData = (streamData: StreamData[]) => {
		const iterations = new Map<number, { image?: string; feedback?: string; isAcceptable?: boolean }>();
		let statusMessage = '';
		let isComplete = false;
		let errorMessage = '';

		streamData.forEach(data => {
			switch (data.type) {
				case 'status':
					statusMessage = data.message || '';
					break;
				case 'image':
					if (typeof data.iteration === 'number' && data.base64) {
						const existing = iterations.get(data.iteration) || {};
						iterations.set(data.iteration, { 
							...existing, 
							image: `data:${data.mediaType || 'image/png'};base64,${data.base64}` 
						});
					}
					break;
				case 'evaluation':
					if (typeof data.iteration === 'number') {
						const existing = iterations.get(data.iteration) || {};
						iterations.set(data.iteration, { 
							...existing, 
							feedback: data.feedback,
							isAcceptable: data.isAcceptable 
						});
					}
					break;
				case 'complete':
					isComplete = true;
					break;
				case 'error':
					errorMessage = data.message || 'An error occurred';
					break;
			}
		});

		return (
			<div className="space-y-4">
				{statusMessage && (
					<div className="flex items-center gap-2">
						<Loader size={16} />
						<span className="text-sm text-muted-foreground">{statusMessage}</span>
					</div>
				)}

				{Array.from(iterations.entries()).map(([iteration, data]) => (
					<Card key={iteration} className="overflow-hidden">
						<CardContent className="p-4">
							<div className="flex items-center gap-2 mb-3">
								<Badge variant="outline">Iteration {iteration + 1}</Badge>
								{data.isAcceptable !== undefined && (
									<Badge variant={data.isAcceptable ? "default" : "secondary"}>
										{data.isAcceptable ? "✓ Accepted" : "⚠ Needs refinement"}
									</Badge>
								)}
							</div>
							
							{data.image && (
								<div className="mb-3">
									<img 
										src={data.image} 
										alt={`Iteration ${iteration + 1}`}
										className="rounded-lg max-w-full h-auto"
									/>
								</div>
							)}
							
							{data.feedback && (
								<div className="text-sm text-muted-foreground">
									<Response>{data.feedback}</Response>
								</div>
							)}
						</CardContent>
					</Card>
				))}

				{isComplete && (
					<div className="text-center py-4">
						<Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
							🎉 Image editing completed successfully!
						</Badge>
					</div>
				)}

				{errorMessage && (
					<div className="text-center py-4">
						<Badge variant="destructive">{errorMessage}</Badge>
					</div>
				)}
			</div>
		);
	};

	return (
		<div className="w-full max-w-4xl mx-auto">
			<Card className="backdrop-blur-sm bg-white/80 dark:bg-gray-900/80 border-white/20 shadow-xl">
				<Conversation className="h-[500px]">
					<ConversationContent>
						{messages.length === 0 ? (
							<div className="flex flex-col items-center justify-center h-full text-center">
								<ImageIcon className="w-12 h-12 text-muted-foreground mb-4" />
								<h3 className="text-lg font-medium mb-2">Ready to edit your images</h3>
								<p className="text-muted-foreground">
									Upload images and describe your desired edits to get started
								</p>
							</div>
						) : (
							messages.map((message) => (
								<div key={message.id} className="mb-6">
									<div className="flex items-start gap-3">
										<div className="flex-shrink-0">
											<div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
												message.role === 'user' 
													? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' 
													: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
											}`}>
												{message.role === 'user' ? 'U' : 'AI'}
											</div>
										</div>
										<div className="flex-1 min-w-0">
											{message.role === 'user' ? (
												<div>
													<p className="text-sm font-medium mb-2">{message.content}</p>
													{message.images && message.images.length > 0 && (
														<div className="grid grid-cols-2 gap-2 max-w-md">
															{message.images.map((src, i) => (
																<img key={i} src={src} alt={`Upload ${i + 1}`} className="rounded-lg" />
															))}
														</div>
													)}
												</div>
											) : (
												<div>
													{message.streamData && message.streamData.length > 0 ? (
														renderStreamData(message.streamData)
													) : (
														<div className="flex items-center gap-2">
															<Loader size={16} />
															<span className="text-sm text-muted-foreground">Processing...</span>
														</div>
													)}
												</div>
											)}
										</div>
									</div>
								</div>
							))
						)}
					</ConversationContent>
					<ConversationScrollButton />
				</Conversation>
			</Card>

			<PromptInput onSubmit={handleSubmit} className="mt-4">
				{attachedFiles.length > 0 && (
					<div className="p-3 border-b">
						<div className="flex flex-wrap gap-2">
							{attachedFiles.map((file, index) => (
								<div key={index} className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
									<ImageIcon className="w-4 h-4" />
									<span className="text-sm truncate max-w-32">{file.name}</span>
									<button
										type="button"
										onClick={() => removeFile(index)}
										className="text-muted-foreground hover:text-foreground"
									>
										<XIcon className="w-4 h-4" />
									</button>
								</div>
							))}
						</div>
					</div>
				)}

				<PromptInputTextarea
					name="message"
					placeholder="Describe the edit you want to make to your images..."
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					disabled={status === 'streaming'}
				/>

				<PromptInputToolbar>
					<PromptInputTools>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							multiple
							onChange={(e) => handleFileAttach(e.target.files)}
							className="hidden"
						/>
						<PromptInputButton
							onClick={() => fileInputRef.current?.click()}
							disabled={status === 'streaming'}
						>
							<PaperclipIcon className="w-4 h-4" />
							Attach Images
						</PromptInputButton>
					</PromptInputTools>
					<PromptInputSubmit 
						status={status === 'streaming' ? 'streaming' : undefined}
						disabled={!prompt.trim() || attachedFiles.length === 0 || status === 'streaming'}
					/>
				</PromptInputToolbar>
			</PromptInput>
		</div>
	);
}