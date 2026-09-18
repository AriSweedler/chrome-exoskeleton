import React, {ReactNode} from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
}

export class TabErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {hasError: false};
    }

    static getDerivedStateFromError(_error: Error): State {
        return {hasError: true};
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('Tab render error:', error, errorInfo);
    }

    componentDidUpdate(prevProps: Props) {
        // Reset error state when children change (new tab selected)
        if (this.props.children !== prevProps.children && this.state.hasError) {
            this.setState({hasError: false});
        }
    }

    render() {
        if (this.state.hasError) {
            return <div className="error">This tab failed to load</div>;
        }

        return this.props.children;
    }
}
